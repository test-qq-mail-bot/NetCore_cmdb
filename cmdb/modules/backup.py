"""modules/backup.py - 全量导入 / 导出与种子数据入口

export_all   导出机柜 + 资产 + 端口为可完整还原的 JSON
import_all   从备份 JSON 还原（merge / overwrite 两种模式）
另含备份相关常量 BACKUP_VERSION / EXPORT_*_FIELDS 以及内部写入辅助。
"""
import json
from typing import Dict, List, Optional

from plugins.cmdb import common
from plugins.cmdb.modules import ports as _ports

BACKUP_VERSION = "20260804-V4"

# 导出字段须覆盖 assets 表中所有业务列（id/created_at/updated_at 由库自动维护，
# 不参与备份），否则导出→导入往返会静默丢字段（如曾遗漏 inventory_time 盘点时间）。
EXPORT_ASSET_FIELDS = [
    "asset_no", "name", "category", "subtype", "user", "dept", "location", "status",
    "brand", "model", "sn", "contract_no", "supplier", "purchase_date", "price",
    "warranty_months", "warranty_expire", "note", "rack_id", "u_start", "u_height",
    "is_network_device", "config", "inventory_time",
]
EXPORT_RACK_FIELDS = [
    "rack_id", "name", "location", "total_u", "status", "contract_no", "supplier",
    "purchase_date", "price", "warranty_months", "warranty_expire", "note",
]
EXPORT_PORT_FIELDS = [
    "port_num", "name", "speed", "remote_device", "remote_port", "note", "status",
]


def export_all() -> dict:
    """导出全量数据（机柜 + 资产 + 端口），用于备份配置，可被 import_all 完整还原。"""
    conn = common._connect()
    try:
        racks = []
        for r in conn.execute("SELECT * FROM racks ORDER BY rack_id").fetchall():
            d = dict(r)
            racks.append({k: d.get(k) for k in EXPORT_RACK_FIELDS})
        assets = []
        for r in conn.execute("SELECT * FROM assets ORDER BY id").fetchall():
            d = dict(r)
            item = {k: d.get(k) for k in EXPORT_ASSET_FIELDS}
            item["is_network_device"] = bool(d.get("is_network_device"))
            try:
                item["config"] = json.loads(d.get("config") or "{}")
            except Exception:
                item["config"] = {}
            item["ports"] = [
                {k: p.get(k) for k in EXPORT_PORT_FIELDS} for p in _ports._get_ports(conn, d["id"])
            ]
            assets.append(item)
        return {
            "meta": {
                "type": "cmdb-backup",
                "version": BACKUP_VERSION,
                "exported_at": common._now(),
                "asset_count": len(assets),
                "rack_count": len(racks),
            },
            "racks": racks,
            "assets": assets,
        }
    finally:
        conn.close()


def _insert_asset_full(conn, item: dict) -> int:
    is_net = 1 if item.get("is_network_device") else 0
    cur = conn.execute(
        """INSERT INTO assets
           (asset_no,name,category,subtype,user,dept,location,status,brand,model,sn,
            contract_no,supplier,purchase_date,price,warranty_months,warranty_expire,
            note,rack_id,u_start,u_height,is_network_device,config,inventory_time)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (item.get("asset_no") or common._gen_asset_no(item.get("category", "IT设备")),
         item.get("name"), item.get("category", "IT设备"), item.get("subtype"),
         item.get("user"), item.get("dept"), item.get("location"), item.get("status", "在库"),
         item.get("brand"), item.get("model"), item.get("sn"), item.get("contract_no"),
         item.get("supplier"), item.get("purchase_date"), float(item.get("price") or 0),
         int(item.get("warranty_months") or 0), item.get("warranty_expire"), item.get("note"),
         item.get("rack_id") or None, item.get("u_start"), item.get("u_height"), is_net,
         common._serialize_config(item.get("config")), item.get("inventory_time") or None),
    )
    aid = cur.lastrowid
    # 备份里已声明网络设备的资产，即使端口列表为空也要保留标记，否则还原后端口区消失
    _ports._replace_ports(conn, aid, item.get("ports") or [], is_network_device=bool(is_net))
    return aid


def _update_asset_full(conn, asset_id: int, item: dict):
    is_net = 1 if item.get("is_network_device") else 0
    conn.execute(
        """UPDATE assets SET name=?,category=?,subtype=?,user=?,dept=?,location=?,status=?,
           brand=?,model=?,sn=?,contract_no=?,supplier=?,purchase_date=?,price=?,
           warranty_months=?,warranty_expire=?,note=?,rack_id=?,u_start=?,u_height=?,
           is_network_device=?,config=?,inventory_time=?,updated_at=? WHERE id=?""",
        (item.get("name"), item.get("category", "IT设备"), item.get("subtype"),
         item.get("user"), item.get("dept"), item.get("location"), item.get("status", "在库"),
         item.get("brand"), item.get("model"), item.get("sn"), item.get("contract_no"),
         item.get("supplier"), item.get("purchase_date"), float(item.get("price") or 0),
         int(item.get("warranty_months") or 0), item.get("warranty_expire"), item.get("note"),
         item.get("rack_id") or None, item.get("u_start"), item.get("u_height"), is_net,
         common._serialize_config(item.get("config")), item.get("inventory_time") or None,
         common._now(), asset_id),
    )
    _ports._replace_ports(conn, asset_id, item.get("ports") or [], is_network_device=bool(is_net))


def _upsert_rack(conn, item: dict) -> Optional[str]:
    """机柜 upsert（按 rack_id 匹配）。返回 'added' / 'updated' / None。"""
    rid = item.get("rack_id")
    if not rid:
        return None
    exists = conn.execute("SELECT id FROM racks WHERE rack_id=?", (rid,)).fetchone()
    vals = (item.get("name"), item.get("location"), int(item.get("total_u") or 42),
            item.get("status", "使用中"), item.get("contract_no"), item.get("supplier"),
            item.get("purchase_date"), float(item.get("price") or 0),
            int(item.get("warranty_months") or 0), item.get("warranty_expire"), item.get("note"))
    if exists:
        conn.execute(
            """UPDATE racks SET name=?,location=?,total_u=?,status=?,contract_no=?,supplier=?,
               purchase_date=?,price=?,warranty_months=?,warranty_expire=?,note=? WHERE rack_id=?""",
            vals + (rid,))
        return "updated"
    conn.execute(
        """INSERT INTO racks (name,location,total_u,status,contract_no,supplier,
           purchase_date,price,warranty_months,warranty_expire,note,rack_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        vals + (rid,))
    return "added"


def import_all(data: dict, mode: str = "merge") -> dict:
    """从备份数据还原。

    mode='merge'：按 asset_no（其次 sn）匹配，存在则更新、不存在则新增，机柜按 rack_id upsert；
    mode='overwrite'：先清空 ports/assets/racks 再整表还原（灾难恢复）。
    返回统计：added/updated/skipped/racks_added/racks_updated/errors/total_after。
    """
    if not isinstance(data, dict):
        return {"success": False, "message": "备份文件格式错误：根节点应为对象"}
    assets = data.get("assets")
    racks = data.get("racks") or []
    if not isinstance(assets, list):
        return {"success": False, "message": "备份文件缺少 assets 列表"}
    if not isinstance(racks, list):
        return {"success": False, "message": "备份文件 racks 字段应为列表"}
    result = {"success": True, "mode": mode, "added": 0, "updated": 0, "skipped": 0,
              "racks_added": 0, "racks_updated": 0, "errors": []}
    conn = common._connect()
    try:
        if mode == "overwrite":
            conn.execute("DELETE FROM ports")
            conn.execute("DELETE FROM assets")
            conn.execute("DELETE FROM racks")
        for rk in racks:
            if not isinstance(rk, dict):  # 防御脏备份文件：非对象元素直接记错，避免 500
                result["errors"].append("机柜条目格式错误（应为对象）：%r" % (rk,))
                continue
            try:
                act = _upsert_rack(conn, rk)
                if act == "added":
                    result["racks_added"] += 1
                elif act == "updated":
                    result["racks_updated"] += 1
            except Exception as e:  # noqa: BLE001
                result["errors"].append("机柜 %s: %s" % (rk.get("rack_id"), e))
        for item in assets:
            if not isinstance(item, dict):  # 同上：非对象元素不进入写入流程
                result["errors"].append("资产条目格式错误（应为对象）：%r" % (item,))
                result["skipped"] += 1
                continue
            try:
                if not item.get("name"):
                    result["skipped"] += 1
                    continue
                existing = None
                if mode != "overwrite":
                    ano = item.get("asset_no")
                    sn = item.get("sn")
                    if ano:
                        existing = conn.execute("SELECT id FROM assets WHERE asset_no=?", (ano,)).fetchone()
                    if existing is None and sn:
                        existing = conn.execute("SELECT id FROM assets WHERE sn=? AND sn<>''", (sn,)).fetchone()
                if existing:
                    _update_asset_full(conn, existing["id"], item)
                    result["updated"] += 1
                else:
                    _insert_asset_full(conn, item)
                    result["added"] += 1
            except Exception as e:  # noqa: BLE001
                result["errors"].append("资产 %s: %s" % (item.get("asset_no") or item.get("name"), e))
        conn.commit()
        result["total_after"] = conn.execute("SELECT COUNT(*) AS c FROM assets").fetchone()["c"]
        return result
    finally:
        conn.close()
