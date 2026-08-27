"""modules/ports.py - 端口读取 / 写入

被 assets / backup / common 复用的端口层：
  - _get_ports(conn, asset_id)  连接内读取（供 _row_to_asset 等复用）
  - get_ports(asset_id)         对外 API 入口
  - _replace_ports(conn, asset_id, ports, is_network_device=None)  整表替换某资产端口
端口数据仅网络设备有，写入非空端口时会顺带把 assets.is_network_device 置为 1；
端口为空时是否复位标记由调用方通过 is_network_device 参数决定（见函数注释）。
"""
from typing import List

from plugins.NetCore_cmdb import common


def _get_ports(conn, asset_id: int) -> List[dict]:
    rows = conn.execute(
        "SELECT * FROM ports WHERE asset_id=? ORDER BY port_num", (asset_id,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_ports(asset_id: int) -> List[dict]:
    conn = common._connect()
    try:
        return _get_ports(conn, asset_id)
    finally:
        conn.close()


def sync_remote_port(conn, local_asset_id: int, local_port_num: int,
                     remote_asset_id: int, remote_port_name: str,
                     force: bool = False, custom_port_name: str = None) -> dict:
    """同步对端端口的 remote_device / remote_port / status 三个字段。

    custom_port_name 不为空时：
      - 若对端设备已有同名端口 → 走场景二（UPDATE 关联）
      - 若无同名端口 → 走场景一（INSERT 新端口，端口号从1自增避让）
    custom_port_name 为空时：按 remote_port_name 匹配已有端口（原有逻辑）。

    返回 {"action": "synced"|"created"|"conflict", "detail": ...}
    conflict 时 detail 包含远程端口当前状态，供前端提示用户。
    """
    local_asset = conn.execute("SELECT name, asset_no FROM assets WHERE id=?", (local_asset_id,)).fetchone()
    if not local_asset:
        return {"action": "error", "detail": "本端资产不存在"}

    local_port = conn.execute(
        "SELECT name FROM ports WHERE asset_id=? AND port_num=?",
        (local_asset_id, local_port_num)
    ).fetchone()
    local_port_name = (local_port["name"] if local_port else None) or ("#" + str(local_port_num))

    remote_device_label = local_asset["name"] or local_asset["asset_no"]
    effective_name = custom_port_name if custom_port_name else remote_port_name

    remote_port = conn.execute(
        "SELECT * FROM ports WHERE asset_id=? AND name=?",
        (remote_asset_id, effective_name)
    ).fetchone()

    if remote_port:
        cur_remote_device = remote_port["remote_device"] or ""
        cur_remote_port = remote_port["remote_port"] or ""
        if not force and cur_remote_device and cur_remote_device != remote_device_label:
            return {
                "action": "conflict",
                "detail": {
                    "remote_device": cur_remote_device,
                    "remote_port": cur_remote_port,
                    "status": remote_port["status"],
                },
            }
        conn.execute(
            "UPDATE ports SET remote_device=?, remote_port=?, remote_asset_id=?, status='connected' WHERE id=?",
            (remote_device_label, local_port_name, local_asset_id, remote_port["id"]),
        )
        return {"action": "synced"}
    else:
        # 场景一：对端无同名端口，自动创建（端口号从1自增避让）
        max_row = conn.execute(
            "SELECT COALESCE(MAX(port_num),0) AS mx FROM ports WHERE asset_id=?",
            (remote_asset_id,)
        ).fetchone()
        next_port_num = (max_row["mx"] if max_row else 0) + 1
        conn.execute(
            """INSERT INTO ports (asset_id, port_num, name, speed, mac, ip, remote_device, remote_port, remote_asset_id, note, status)
               VALUES (?, ?, ?, '', '', '', ?, ?, ?, '', 'connected')""",
            (remote_asset_id, next_port_num, effective_name, remote_device_label, local_port_name, local_asset_id),
        )
        return {"action": "created", "detail": {"port_num": next_port_num, "name": effective_name}}


def _replace_ports(conn, asset_id: int, ports: List[dict], is_network_device=None):
    """整表替换某资产的端口。

    is_network_device 用于在「端口为空」时决定 assets.is_network_device 的取值：
      - None（默认）：视为调用方在显式编辑端口，清空端口即复位为非网络设备；
      - True：调用方已显式声明是网络设备（如 CSV 导入按子类判定、备份还原带回原标记），
              此时即使暂无端口也保留标记，否则端口区/拓扑统计会永远看不到该设备；
      - False：显式声明非网络设备，复位为 0。
    端口非空时一律置 1（有端口必然是网络设备）。
    """
    conn.execute("DELETE FROM ports WHERE asset_id=?", (asset_id,))
    for p in ports:
        try:
            num = int(p.get("port_num") or 0)
        except (TypeError, ValueError):
            raise ValueError("端口号必须为正整数：%r" % (p.get("port_num"),))
        if num <= 0:
            continue
        conn.execute(
            """INSERT INTO ports (asset_id, port_num, name, speed, mac, ip, remote_device, remote_port, remote_asset_id, note, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (asset_id, num, p.get("name"), p.get("speed"), p.get("mac"), p.get("ip"),
             p.get("remote_device"), p.get("remote_port"), p.get("remote_asset_id"),
             p.get("note"), p.get("status", "disconnected")),
        )
    # 有端口即视为网络设备；无端口时按调用方声明处理（见函数注释），
    # 避免「导入时已标记为网络设备但尚未录入端口」的设备被误清零。
    if ports:
        conn.execute("UPDATE assets SET is_network_device=1 WHERE id=?", (asset_id,))
    elif not is_network_device:
        conn.execute("UPDATE assets SET is_network_device=0 WHERE id=?", (asset_id,))
