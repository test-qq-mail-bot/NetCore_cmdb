"""modules/racks.py - 机柜 CRUD 与 U 位设备查询

create_rack / update_rack / list_racks / get_rack / _rack_devices。
list_racks 与 get_rack 会附带该机柜内设备列表（_rack_devices）。
"""
from typing import Dict, List, Optional

from plugins.cmdb import common


def create_rack(data: dict) -> int:
    conn = common._connect()
    try:
        cur = conn.execute(
            """INSERT INTO racks (rack_id, name, location, total_u, status, contract_no,
               supplier, purchase_date, price, warranty_months, warranty_expire, note)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (data.get("rack_id"), data.get("name"), data.get("location"),
             int(data.get("total_u") or 42), data.get("status", "使用中"),
             data.get("contract_no"), data.get("supplier"), data.get("purchase_date"),
             float(data.get("price") or 0), int(data.get("warranty_months") or 0),
             data.get("warranty_expire"), data.get("note")),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def update_rack(rack_id: str, data: dict) -> bool:
    """更新机柜信息（名称/位置/总U数/状态/备注等，rack_id 本身不可改）。

    调小总U数时会校验是否会让已上架设备越界，越界则抛 ValueError（路由层转 400），
    否则这些设备将从机柜视图中"消失"（前端按 total_u 渲染 U 位列表）。
    """
    mapping = {
        "name": "name",
        "location": "location",
        "total_u": "total_u",
        "status": "status",
        "contract_no": "contract_no",
        "supplier": "supplier",
        "purchase_date": "purchase_date",
        "price": "price",
        "warranty_expire": "warranty_expire",
        "note": "note",
    }
    fields, values = [], []
    for key, col in mapping.items():
        if key in data:
            val = data[key]
            if key == "total_u":
                val = int(val or 42)
            elif key == "price":
                val = float(val or 0)
            fields.append("%s=?" % col)
            values.append(val)
    if not fields:
        return False
    values.append(rack_id)
    conn = common._connect()
    try:
        if "total_u" in data:
            new_total = int(data["total_u"] or 42)
            for d in _rack_devices(conn, rack_id):
                try:
                    end_u = int(d["u_start"]) + int(d["u_height"] or 1) - 1
                except (TypeError, ValueError):
                    continue
                if end_u > new_total:
                    raise ValueError(
                        "总U数不能调整为 %dU：设备「%s」已占用至 %dU，请先下架或调整该设备"
                        % (new_total, d["name"] or d["id"], end_u)
                    )
        cur = conn.execute("UPDATE racks SET %s WHERE rack_id=?" % ", ".join(fields), values)
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def unbind_asset(asset_id: int) -> bool:
    """将单台资产从机柜下架（清空 rack_id / u_start / u_height），资产台账保留。

    用于机柜 U 位视图的「移出机柜」操作：设备下架不等于报废，
    因此只解除机柜绑定关系，assets 记录本身完全不动。
    """
    conn = common._connect()
    try:
        cur = conn.execute(
            "UPDATE assets SET rack_id=NULL, u_start=NULL, u_height=NULL,"
            " updated_at=datetime('now','localtime') WHERE id=?",
            (int(asset_id),),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_rack(rack_id: str, force: bool = False) -> Dict:
    """删除机柜。

    机柜内仍有已上架设备时：
      - force=False：不删除，返回 {"ok": False, "devices": N}，由路由层转 400 提示；
      - force=True ：先把这些资产解绑下架（rack_id/u_start/u_height 置空，
                     **资产台账保留**），再删除机柜记录。

    删除机柜绝不连带删除资产 —— 机柜是承载位置，资产是台账主体，
    位置消失不代表设备报废，误删台账不可逆。
    """
    conn = common._connect()
    try:
        row = conn.execute("SELECT rack_id FROM racks WHERE rack_id=?", (rack_id,)).fetchone()
        if not row:
            return {"ok": False, "not_found": True, "devices": 0, "unbound": 0}
        devices = _rack_devices(conn, rack_id)
        if devices and not force:
            return {"ok": False, "not_found": False, "devices": len(devices), "unbound": 0}
        unbound = 0
        if devices:
            cur = conn.execute(
                "UPDATE assets SET rack_id=NULL, u_start=NULL, u_height=NULL,"
                " updated_at=datetime('now','localtime') WHERE rack_id=?",
                (rack_id,),
            )
            unbound = cur.rowcount
        conn.execute("DELETE FROM racks WHERE rack_id=?", (rack_id,))
        conn.commit()
        return {"ok": True, "not_found": False, "devices": len(devices), "unbound": unbound}
    finally:
        conn.close()


def list_racks() -> List[dict]:
    conn = common._connect()
    try:
        rows = conn.execute("SELECT * FROM racks ORDER BY rack_id").fetchall()
        return [dict(r) | {"devices": _rack_devices(conn, dict(r)["rack_id"])} for r in rows]
    finally:
        conn.close()


def get_rack(rack_id: str) -> Optional[dict]:
    conn = common._connect()
    try:
        row = conn.execute("SELECT * FROM racks WHERE rack_id=?", (rack_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["devices"] = _rack_devices(conn, rack_id)
        return d
    finally:
        conn.close()


def _rack_devices(conn, rack_id: str) -> List[dict]:
    rows = conn.execute(
        "SELECT id, name, subtype, u_start, u_height, status FROM assets WHERE rack_id=?",
        (rack_id,),
    ).fetchall()
    return [dict(r) for r in rows]
