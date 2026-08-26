"""
common.py - CMDB 插件公共数据层

所有模块共享的内容：
  - 数据库连接与表结构初始化
  - 资产编号生成、时间工具
  - 资产行转换（含端口）、保修天数计算、即将过保列表
  - 首次运行种子数据

各业务功能分散在 modules/ 子包（assets/racks/ports/dashboard/maintenance/
reports/backup），本文件不实现具体业务 CRUD，仅提供基础设施与
被多处复用的小工具。
"""
import json
import random
import sqlite3
from datetime import datetime
from pathlib import Path

from core.config_loader import PLUGINS_DIR
from core.timeutil import utc_now_str

DB_PATH = PLUGINS_DIR / "NetCore_cmdb" / "data" / "cmdb.db"

# 资产分类前缀（用于生成资产编号）
CATEGORY_PREFIX = {
    "IT设备": "IT",
    "办公家具": "OF",
    "生产设备": "PE",
}


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        # WAL + busy_timeout：缓解多标签页/多用户并发写时的 database is locked（避免 500）
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.DatabaseError:
        pass
    return conn


def init_db():
    """创建数据表（若不存在）。

    返回 bool：本次调用是否首次创建 cmdb.db 数据库文件。
    供 plugin.on_load 判断「是否首次运行」以决定是否播种演示数据。
    """
    was_new = not DB_PATH.exists()
    conn = _connect()
    try:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_no TEXT UNIQUE,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'IT设备',
            subtype TEXT,
            user TEXT,
            dept TEXT,
            location TEXT,
            status TEXT,
            brand TEXT,
            model TEXT,
            sn TEXT,
            color TEXT,
            storage TEXT,
            memory TEXT,
            contract_no TEXT,
            supplier TEXT,
            purchase_date TEXT,
            price REAL DEFAULT 0,
            warranty_months INTEGER DEFAULT 0,
            warranty_expire TEXT,
            note TEXT,
            rack_id TEXT,
            u_start INTEGER,
            u_height INTEGER,
            is_network_device INTEGER DEFAULT 0,
            config TEXT,
            inventory_time TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS racks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rack_id TEXT UNIQUE NOT NULL,
            name TEXT,
            location TEXT,
            total_u INTEGER DEFAULT 42,
            status TEXT,
            contract_no TEXT,
            supplier TEXT,
            purchase_date TEXT,
            price REAL DEFAULT 0,
            warranty_months INTEGER DEFAULT 0,
            warranty_expire TEXT,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS ports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            port_num INTEGER NOT NULL,
            name TEXT,
            speed TEXT,
            mac TEXT,
            ip TEXT,
            remote_device TEXT,
            remote_port TEXT,
            note TEXT,
            status TEXT DEFAULT 'disconnected',
            FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
        CREATE INDEX IF NOT EXISTS idx_assets_rack ON assets(rack_id);
        CREATE INDEX IF NOT EXISTS idx_ports_asset ON ports(asset_id);

        -- 库级元数据表（键值对）：预留结构。
        -- 此前演示数据判定改为「cmdb.db 文件是否存在」，
        -- 不再依赖本表的 demo_seeded 标记；本表保留以便未来扩展。 
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        """)
        conn.commit()
        # —— 迁移：老库补充 inventory_time 列（盘点时间） ——
        try:
            cols = [r["name"] for r in conn.execute("PRAGMA table_info(assets)").fetchall()]
            if "inventory_time" not in cols:
                conn.execute("ALTER TABLE assets ADD COLUMN inventory_time TEXT")
                conn.commit()
        except sqlite3.DatabaseError:
            pass
        try:
            cols = [r["name"] for r in conn.execute("PRAGMA table_info(assets)").fetchall()]
            for col in ("color", "storage", "memory"):
                if col not in cols:
                    conn.execute("ALTER TABLE assets ADD COLUMN %s TEXT" % col)
            conn.commit()
        except sqlite3.DatabaseError:
            pass
        try:
            pcols = [r["name"] for r in conn.execute("PRAGMA table_info(ports)").fetchall()]
            for col in ("mac", "ip"):
                if col not in pcols:
                    conn.execute("ALTER TABLE ports ADD COLUMN %s TEXT" % col)
            conn.commit()
        except sqlite3.DatabaseError:
            pass
        # —— 迁移：清理存量 system_info 中的 password 密文字段（需求3：CMDB 不再保存密码） ——
        try:
            rows = conn.execute("SELECT id, config FROM assets WHERE config LIKE '%password%'").fetchall()
            if rows:
                import json as _json
                for row in rows:
                    cfg = _json.loads(row["config"]) if row["config"] else {}
                    items = cfg.get("system_info")
                    if isinstance(items, list):
                        changed = False
                        for item in items:
                            if isinstance(item, dict) and "password" in item:
                                del item["password"]
                                changed = True
                        if changed:
                            conn.execute("UPDATE assets SET config=? WHERE id=?",
                                         (_json.dumps(cfg, ensure_ascii=False), row["id"]))
                conn.commit()
                logger.info("已清理存量资产 system_info 中的 password 密文字段")
        except sqlite3.DatabaseError:
            pass
    finally:
        conn.close()
    return was_new


def _now() -> str:
    """入库时间统一用 UTC（需求2：与 SQLite datetime('now') 保持一致，前端 fmtTime 换算显示）"""
    return utc_now_str()


def _gen_asset_no(category: str) -> str:
    """生成资产编号：「分类前缀-年份+5位随机数」，如 IT-202683471。

    未知分类统一用 AS 前缀。随机数有极小概率与既有编号撞车（asset_no 有 UNIQUE
    约束），由 modules.assets.create_asset 捕获后重试。
    """
    prefix = CATEGORY_PREFIX.get(category, "AS")
    year = datetime.now().year
    return "%s-%s%s" % (prefix, year, str(random.randint(10000, 99999)))


def _row_to_asset(conn, row) -> dict:
    """将 assets 行转换为字典，并附带 config / 端口列表。"""
    d = dict(row)
    try:
        d["config"] = json.loads(d.get("config") or "{}")
    except Exception:
        d["config"] = {}
    d["is_network_device"] = bool(d.get("is_network_device"))
    from plugins.NetCore_cmdb.modules import ports as _ports
    d["ports"] = _ports._get_ports(conn, d["id"])
    return d


def _days_left(expire_str: str):
    if not expire_str:
        return None
    try:
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        exp = datetime.strptime(expire_str, "%Y-%m-%d").replace(hour=0, minute=0, second=0, microsecond=0)
        return (exp - today).days
    except Exception:
        return None


def _expiring_list(conn, limit_days: int = 30) -> list:
    """返回保修剩余天数 <= limit_days 的资产列表（含 days_left 字段）。"""
    rows = conn.execute(
        "SELECT * FROM assets WHERE warranty_expire IS NOT NULL AND category <> '机柜' AND status <> '报废'"
    ).fetchall()
    out = []
    for r in rows:
        d = _row_to_asset(conn, r)
        days = _days_left(d.get("warranty_expire"))
        if days is not None and days <= limit_days:
            d["days_left"] = days
            out.append(d)
    out.sort(key=lambda x: x.get("warranty_expire") or "")
    return out


def _serialize_config(cfg) -> str:
    if isinstance(cfg, (dict, list)):
        return json.dumps(cfg, ensure_ascii=False)
    if cfg is None:
        return "{}"
    return str(cfg)


# 演示数据一次性播种标记（存于 meta 表）
_META_SEEDED_KEY = "demo_seeded"


def _meta_get(conn, key: str, default=None):
    """读取 meta 键值。极老的库可能尚无 meta 表，异常时返回默认值。"""
    try:
        row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    except sqlite3.DatabaseError:
        return default
    return row["value"] if row else default


def _meta_set(conn, key: str, value: str):
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def _meta_del(conn, key: str):
    try:
        conn.execute("DELETE FROM meta WHERE key = ?", (key,))
    except sqlite3.DatabaseError:
        pass


def seed_if_empty(force: bool = False):
    """仅当 cmdb.db 数据库文件不存在（首次运行）时写入一次演示数据（机柜+资产+端口）。

    判定条件修正：由「meta 一次性标记/表为空」改为
    「数据库文件本身不存在」。文件一旦创建——无论数据是否被清空——重启后都
    绝不回灌演示数据，演示数据只属于「开箱即用」的首次体验。
    - force=False（默认）：文件已存在即返回 False（绝大多数启动路径，文件由 init_db 创建）；
    - force=True：调用方已确认需要写入（首次启动播种 / 用户手动恢复演示数据）。
    """
    # 核心判定：数据库文件不存在才播种（force=True 时跳过该判定）
    if not force and DB_PATH.exists():
        return False
    conn = _connect()
    try:
        cnt = conn.execute("SELECT COUNT(*) AS c FROM assets").fetchone()["c"]
        rack_cnt = conn.execute("SELECT COUNT(*) AS c FROM racks").fetchone()["c"]
        if cnt > 0 or rack_cnt > 0:
            # 文件存在但已有数据（如极旧库），不再播种，避免编号冲突
            return False
        # —— 机柜 ——
        racks = [
            ("CAB-A01", "CAB-A01 标准机柜", "A栋数据中心", 42, "使用中", "HT-2023-0060", "图腾机柜", "2023-03-15", 5800, 60, "2028-03-14"),
            ("CAB-A02", "CAB-A02 标准机柜", "A栋数据中心", 42, "使用中", "HT-2023-0061", "图腾机柜", "2023-03-15", 5800, 60, "2028-03-14"),
            ("CAB-A03", "CAB-A03 标准机柜", "A栋数据中心", 42, "闲置", "HT-2024-0001", "图腾机柜", "2024-01-10", 6200, 60, "2029-01-09"),
            ("CAB-B05", "CAB-B05 壁挂机柜", "B栋弱电间", 24, "使用中", "HT-2024-0002", "图腾机柜", "2024-01-10", 2800, 60, "2029-01-09"),
            ("CAB-C01", "CAB-C01 标准机柜", "C栋机房", 42, "使用中", "HT-2024-0003", "图腾机柜", "2024-01-10", 6200, 60, "2029-01-09"),
        ]
        for rk in racks:
            conn.execute(
                "INSERT INTO racks (rack_id,name,location,total_u,status,contract_no,supplier,purchase_date,price,warranty_months,warranty_expire) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                rk,
            )
        # —— 资产（机柜以外的）——
        assets = [
            # 1) IT-笔记本：常规办公资产，无端口/机柜，系统信息 1 条
            ("IT-", "ThinkPad X1 Carbon", "IT设备", "笔记本", "张三", "研发部", "B栋302-01",
             "使用中", "联想", "X1 Carbon Gen12", "PF-3AB2C4D5", "黑色", "1TB SSD", "32GB",
             "HT-2024-0015", "联想官方旗舰店", "2024-01-15", 12800, 36, "2027-01-14",
             '{"system_info":[{"ip":"192.168.1.101","login_method":"SSH","port":22,"username":"zhangsan","note":"办公笔记本"}]}',
             None, None, None, 0, "2026-06-30", []),
            # 2) IT-服务器：机柜上架 + 2 端口 + 2 条系统信息
            ("IT-", "Dell PowerEdge R750", "IT设备", "服务器", "管理员", "IT部", "A栋数据中心",
             "使用中", "戴尔", "R750", "DL-8821XY", "银灰色", "4×1.92TB SSD", "256GB",
             "HT-2023-0088", "戴尔中国", "2023-06-01", 68500, 36, "2026-05-31",
             '{"system_info":[{"ip":"10.10.10.5","login_method":"SSH","port":22,"username":"root","note":"业务服务器"},{"ip":"10.10.10.6","login_method":"Web","port":443,"username":"admin","note":"带外管理"}]}',
             "CAB-A02", 12, 2, 1, "2026-05-20", [
                {"port_num": 1, "name": "eth0", "speed": "100GbE", "mac": "D4:BE:D9:11:22:33", "ip": "10.10.10.5", "remote_device": "Cisco 93180", "remote_port": "Eth1/1", "note": "业务口", "status": "connected"},
                {"port_num": 2, "name": "eth1", "speed": "100GbE", "mac": "D4:BE:D9:11:22:34", "ip": "10.10.10.6", "remote_device": "Cisco 93180", "remote_port": "Eth1/2", "note": "带外", "status": "connected"},
            ]),
            # 3) IT-交换机（思科）：机柜 + 4 端口 + 系统信息
            ("IT-", "Cisco Nexus 93180", "IT设备", "交换机", "网络管理员", "IT部", "A栋数据中心",
             "使用中", "思科", "Nexus 93180YC-FX", "CS-7710AB", "黑色", "128GB SSD", "16GB",
             "HT-2024-0022", "思科金牌代理", "2024-03-01", 152000, 36, "2027-02-28",
             '{"system_info":[{"ip":"10.10.10.1","login_method":"Console","port":0,"username":"cisco","note":"核心交换机"}]}',
             "CAB-A02", 24, 1, 1, "2026-04-15", [
                {"port_num": 1, "name": "Eth1/1", "speed": "100GbE", "mac": "00:1C:58:AA:BB:01", "ip": "", "remote_device": "Dell R750", "remote_port": "eth0", "note": "服务器", "status": "connected"},
                {"port_num": 2, "name": "Eth1/2", "speed": "100GbE", "mac": "00:1C:58:AA:BB:02", "ip": "", "remote_device": "Dell R750", "remote_port": "eth1", "note": "带外", "status": "connected"},
                {"port_num": 3, "name": "Eth1/3", "speed": "100GbE", "mac": "00:1C:58:AA:BB:03", "ip": "", "remote_device": "核心路由器", "remote_port": "GE0/0/0", "note": "上联", "status": "connected"},
                {"port_num": 48, "name": "Eth1/48", "speed": "100GbE", "mac": "00:1C:58:AA:BB:30", "ip": "", "remote_device": "防火墙", "remote_port": "Port1", "note": "外网", "status": "connected"},
            ]),
            # 4) IT-交换机（华三）：机柜 + 2 端口
            ("IT-", "H3C S5130S", "IT设备", "交换机", "网络管理员", "IT部", "B栋弱电间",
             "使用中", "新华三", "S5130S-28P-EI", "H3-5520XX", "灰色", "32GB SSD", "8GB",
             "HT-2024-0030", "H3C授权经销商", "2024-04-15", 8900, 36, "2027-04-14",
             '{"system_info":[{"ip":"192.168.10.1","login_method":"Telnet","port":23,"username":"admin","note":"楼层接入"}]}',
             "CAB-B05", 10, 1, 1, "2026-03-01", [
                {"port_num": 1, "name": "G1/0/1", "speed": "1GbE", "mac": "2C:23:3A:CC:DD:01", "ip": "", "remote_device": "AP-01", "remote_port": "Lan1", "note": "无线", "status": "connected"},
                {"port_num": 24, "name": "G1/0/24", "speed": "1GbE", "mac": "2C:23:3A:CC:DD:18", "ip": "", "remote_device": "打印机", "remote_port": "LAN", "note": "办公", "status": "disconnected"},
            ]),
            # 5) IT-路由器（华为）：机柜 + 2 端口
            ("IT-", "Huawei AR6140", "IT设备", "路由器", "网络管理员", "IT部", "A栋数据中心",
             "使用中", "华为", "AR6140-9G-2AC", "HW-6140XY", "深灰色", "16GB Flash", "4GB",
             "HT-2024-0035", "华为企业网络", "2024-05-20", 24500, 24, "2026-05-19",
             '{"system_info":[{"ip":"10.0.0.1","login_method":"SSH","port":22,"username":"huawei","note":"出口路由"}]}',
             "CAB-A01", 5, 1, 1, "2026-02-28", [
                {"port_num": 1, "name": "GE0/0/0", "speed": "1GbE", "mac": "4C:1F:CC:EE:FF:01", "ip": "10.0.0.1", "remote_device": "交换机", "remote_port": "Eth1/3", "note": "LAN", "status": "connected"},
                {"port_num": 2, "name": "GE0/0/1", "speed": "1GbE", "mac": "4C:1F:CC:EE:FF:02", "ip": "", "remote_device": "防火墙", "remote_port": "Port2", "note": "WAN", "status": "connected"},
            ]),
            # 6) IT-防火墙（深信服）：机柜 + 2 端口
            ("IT-", "Sangfor AF-1000", "IT设备", "防火墙", "安全管理员", "安全部", "A栋数据中心",
             "使用中", "深信服", "AF-1000-L1600", "SF-1000XY", "黑色", "240GB SSD", "8GB",
             "HT-2023-0150", "深信服科技", "2023-12-10", 58000, 12, "2024-12-09",
             '{"system_info":[{"ip":"10.0.0.254","login_method":"Web","port":443,"username":"admin","note":"边界防火墙"}]}',
             "CAB-A01", 8, 1, 1, "2026-01-15", [
                {"port_num": 1, "name": "Port1", "speed": "1GbE", "mac": "00:0C:29:AB:CD:01", "ip": "", "remote_device": "路由器", "remote_port": "GE0/0/1", "note": "外网口", "status": "connected"},
                {"port_num": 2, "name": "Port2", "speed": "1GbE", "mac": "00:0C:29:AB:CD:02", "ip": "", "remote_device": "交换机", "remote_port": "Eth1/48", "note": "内网口", "status": "connected"},
            ]),
            # 7) IT-无线AP（安移通）：1 端口 + 系统信息
            ("IT-", "Aruba AP-535", "IT设备", "AP", "无线网络", "IT部", "B栋走廊",
             "使用中", "安移通", "AP-535", "AR-535XY", "白色", "8GB eMMC", "4GB",
             "HT-2024-0040", "Aruba代理商", "2024-06-01", 3200, 12, "2025-05-31",
             '{"system_info":[{"ip":"192.168.20.5","login_method":"Web","port":8443,"username":"aruba","note":"无线接入点"}]}',
             None, None, None, 1, "2026-06-01", [
                {"port_num": 1, "name": "Eth0", "speed": "2.5GbE", "mac": "70:4F:57:12:34:56", "ip": "192.168.20.5", "remote_device": "交换机", "remote_port": "G1/0/1", "note": "POE供电", "status": "connected"},
            ]),
            # 8) IT-手机：维修中状态
            ("IT-", "iPhone 14 测试机", "IT设备", "手机", "孙七", "测试部", "B栋405",
             "维修中", "苹果", "iPhone 14", "IP-14XY", "蓝色", "128GB", "6GB",
             "HT-2023-0005", "Apple Store", "2023-09-01", 6999, 12, "2024-08-31",
             '{}', None, None, None, 0, "2025-12-20", []),
            # 9) IT-台式机：在库状态
            ("IT-", "HP EliteDesk 800", "IT设备", "台式机", "", "行政部", "C栋仓库",
             "在库", "惠普", "EliteDesk 800 G9", "HP-800XY", "黑色", "512GB SSD", "16GB",
             "HT-2024-0050", "惠普授权经销商", "2024-07-01", 5600, 36, "2027-06-30",
             '{"system_info":[{"ip":"","login_method":"SSH","port":22,"username":"admin","note":"备用机"}]}',
             None, None, None, 0, "", []),
            # 10) 办公家具-工位桌：闲置状态
            ("OF-", "员工工位桌", "办公家具", "工位桌", "李四", "市场部", "A栋201",
             "闲置", "震旦", "工位桌 1400×600", "OF-042XY", "原木色", "", "",
             "HT-2023-0100", "震旦家具", "2023-11-20", 1850, 60, "2028-11-19",
             '{}', None, None, None, 0, "", []),
            # 11) 办公家具-高管办公椅：使用中
            ("OF-", "高管办公椅", "办公家具", "办公椅", "王五", "总经办", "C栋501",
             "使用中", "冈村", "Contessa", "OF-088XY", "黑色", "", "",
             "HT-2024-0008", "冈村中国", "2024-02-10", 4200, 60, "2029-02-09",
             '{}', None, None, None, 0, "2026-04-10", []),
            # 12) 生产设备-CNC：运行中状态
            ("PE-", "CNC加工中心", "生产设备", "机床", "赵六", "生产部", "1号厂房A区",
             "运行中", "沈阳机床", "VMC-850", "CNC-056XY", "蓝色", "", "",
             "HT-2022-0030", "沈阳机床集团", "2022-05-12", 285000, 36, "2025-05-11",
             '{}', None, None, None, 0, "2026-03-25", []),
        ]
        for a in assets:
            (asset_no, name, category, subtype, user, dept, location, status, brand, model,
             sn, color, storage, memory, contract_no, supplier, purchase_date, price,
             warranty_months, warranty_expire, config_json, rack_id, u_start, u_height,
             is_net, inventory_time, ports) = a
            from plugins.NetCore_cmdb.modules import ports as _ports
            cur = conn.execute(
                """INSERT INTO assets
                   (asset_no,name,category,subtype,user,dept,location,status,brand,model,sn,
                    color,storage,memory,contract_no,supplier,purchase_date,price,
                    warranty_months,warranty_expire,config,rack_id,u_start,u_height,
                    is_network_device,inventory_time)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (asset_no, name, category, subtype, user, dept, location, status, brand, model, sn,
                 color, storage, memory, contract_no, supplier, purchase_date, price,
                 warranty_months, warranty_expire, config_json, rack_id, u_start, u_height,
                 is_net, inventory_time),
            )
            aid = cur.lastrowid
            _ports._replace_ports(conn, aid, ports)
        conn.commit()
        return True
    finally:
        conn.close()


def restore_demo_data() -> dict:
    """手动恢复演示数据（供 CMDB 设置页调用，前端需二次确认）。

    与 seed_if_empty() 的区别：不看数据库文件是否已存在，用户主动要求即写入。
    因 racks.rack_id 与 assets.asset_no 均有 UNIQUE 约束，若库中尚有数据会
    插入冲突，故要求当前资产与机柜均为空，否则拒绝并提示用户先清空。
    """
    conn = _connect()
    try:
        cnt = conn.execute("SELECT COUNT(*) AS c FROM assets").fetchone()["c"]
        rack_cnt = conn.execute("SELECT COUNT(*) AS c FROM racks").fetchone()["c"]
        if cnt > 0 or rack_cnt > 0:
            return {"success": False,
                    "message": "当前已有 %d 个资产、%d 个机柜。为避免资产编号/机柜编号冲突，"
                               "请先清空资产与机柜后再恢复演示数据。" % (cnt, rack_cnt)}
    finally:
        conn.close()
    ok = seed_if_empty(force=True)
    if ok:
        return {"success": True, "message": "已恢复演示数据：12 个资产、5 个机柜"}
    return {"success": False, "message": "恢复演示数据失败，请检查数据库是否可写"}
