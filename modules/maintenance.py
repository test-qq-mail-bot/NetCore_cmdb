"""modules/maintenance.py - 维保到期预警列表

返回 {"expiring": 即将到期(<=30天), "normal": 正常在保} 两类资产，
各自带 days_left 字段并按保修到期日排序。
"""
from plugins.NetCore_cmdb import common


def maintenance_lists() -> dict:
    conn = common._connect()
    try:
        expiring = common._expiring_list(conn, 30)
        rows = conn.execute(
            "SELECT * FROM assets WHERE warranty_expire IS NOT NULL AND category <> '机柜' AND status <> '报废'"
        ).fetchall()
        normal = []
        for r in rows:
            d = common._row_to_asset(conn, r)
            days = common._days_left(d.get("warranty_expire"))
            if days is not None and days > 30:
                d["days_left"] = days
                normal.append(d)
        normal.sort(key=lambda x: x.get("warranty_expire") or "")
        return {"expiring": expiring, "normal": normal}
    finally:
        conn.close()
