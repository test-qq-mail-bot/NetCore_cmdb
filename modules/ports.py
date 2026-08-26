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
            """INSERT INTO ports (asset_id, port_num, name, speed, mac, ip, remote_device, remote_port, note, status)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (asset_id, num, p.get("name"), p.get("speed"), p.get("mac"), p.get("ip"),
             p.get("remote_device"), p.get("remote_port"), p.get("note"), p.get("status", "disconnected")),
        )
    # 有端口即视为网络设备；无端口时按调用方声明处理（见函数注释），
    # 避免「导入时已标记为网络设备但尚未录入端口」的设备被误清零。
    if ports:
        conn.execute("UPDATE assets SET is_network_device=1 WHERE id=?", (asset_id,))
    elif not is_network_device:
        conn.execute("UPDATE assets SET is_network_device=0 WHERE id=?", (asset_id,))
