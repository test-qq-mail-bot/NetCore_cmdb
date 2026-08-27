"""modules/reports.py - 报表查询

report_inventory  资产盘点明细
report_by_dept    按部门汇总（数量 + 原值合计）
"""
from typing import List

from plugins.NetCore_cmdb import common


def report_inventory() -> List[dict]:
    conn = common._connect()
    try:
        rows = conn.execute(
            "SELECT asset_no, name, category, subtype, brand, user, dept, location, status, color, price, warranty_expire FROM assets WHERE category <> '机柜' ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def report_by_dept() -> List[dict]:
    conn = common._connect()
    try:
        rows = conn.execute(
            "SELECT dept, COUNT(*) AS cnt, COALESCE(SUM(price),0) AS total FROM assets WHERE category <> '机柜' GROUP BY dept ORDER BY cnt DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
