"""modules/dashboard.py - 资产仪表盘统计"""
from plugins.cmdb import common


def dashboard_stats() -> dict:
    conn = common._connect()
    try:
        total = conn.execute("SELECT COUNT(*) AS c FROM assets WHERE category <> '机柜'").fetchone()["c"]
        it = conn.execute("SELECT COUNT(*) AS c FROM assets WHERE category='IT设备'").fetchone()["c"]
        rack_count = conn.execute("SELECT COUNT(*) AS c FROM racks").fetchone()["c"]
        price_row = conn.execute(
            "SELECT COALESCE(SUM(price),0) AS s FROM assets WHERE category <> '机柜'"
        ).fetchone()
        total_value = float(price_row["s"]) if price_row else 0.0
        # 已占 U / 总 U
        used_u = 0
        total_u = 0
        for rk in conn.execute("SELECT rack_id, total_u FROM racks").fetchall():
            total_u += int(rk["total_u"] or 0)
            devs = conn.execute(
                "SELECT COALESCE(SUM(u_height),0) AS s FROM assets WHERE rack_id=?",
                (rk["rack_id"],),
            ).fetchone()
            used_u += int(devs["s"] or 0)
        # 即将过保 (<30天，含已过保)
        expiring = common._expiring_list(conn, limit_days=30)
        return {
            "total_assets": total,
            "it_assets": it,
            "rack_count": rack_count,
            "total_value": round(total_value, 2),
            "used_u": used_u,
            "total_u": total_u,
            "expiring_count": len(expiring),
        }
    finally:
        conn.close()
