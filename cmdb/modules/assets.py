"""modules/assets.py - 资产 CRUD（机柜以外的所有资产）

create_asset / get_asset / list_assets / update_asset / delete_asset。
端口写入复用 modules.ports._replace_ports。
系统信息（config.system_info）中的密码使用 core.crypto_utils AES-256-GCM 加密存储，
存储格式 "enc:<密文>"；get_asset 返回时解密，list_assets 返回时脱敏。
加密失败（如未配置 encryption_key）默认拒绝入库，不做明文降级，
可用环境变量 CMDB_ALLOW_PLAINTEXT_PASSWORD=1 显式放行（仅限内网调试）。
"""
import json
import os
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from core.config_loader import get_encryption_key
from core.crypto_utils import CryptoUtils
from core.logger import get_logger
from plugins.cmdb import common
from plugins.cmdb.modules import ports as _ports

logger = get_logger()

_ENC_PREFIX = "enc:"


def _allow_plaintext_password() -> bool:
    """是否允许加密失败时明文入库（默认否）。仅供调试环境显式开启。"""
    return str(os.environ.get("CMDB_ALLOW_PLAINTEXT_PASSWORD", "")).strip().lower() in ("1", "true", "yes")


def _encrypt_system_info(config: dict) -> dict:
    """入库前加密 config.system_info 内各条目的 password（幂等：已加密的跳过）。

    加密失败时记录 error 日志并抛出 ValueError（由路由层转 400），避免密码
    以明文形式落库；确需降级时须显式设置 CMDB_ALLOW_PLAINTEXT_PASSWORD=1。
    """
    if not isinstance(config, dict):
        return config
    items = config.get("system_info")
    if not isinstance(items, list):
        return config
    key = get_encryption_key()
    for item in items:
        if not isinstance(item, dict):
            continue
        pwd = item.get("password")
        if pwd and isinstance(pwd, str) and not pwd.startswith(_ENC_PREFIX):
            try:
                item["password"] = _ENC_PREFIX + CryptoUtils.encrypt(pwd, key)
            except Exception as e:  # noqa: BLE001
                logger.error("系统信息密码加密失败（拒绝明文入库）: %s" % e)
                if not _allow_plaintext_password():
                    raise ValueError(
                        "系统信息密码加密失败，已拒绝保存以防明文泄露："
                        "请检查 config/core.yaml 的 crypto.encryption_key 配置"
                    )
                logger.warning("CMDB_ALLOW_PLAINTEXT_PASSWORD 已开启，密码将以明文存储（存在泄露风险）")
    return config


def _decrypt_system_info(config: dict) -> dict:
    """出库后解密 config.system_info 内各条目的 password（供详情/编辑使用）。"""
    if not isinstance(config, dict):
        return config
    items = config.get("system_info")
    if not isinstance(items, list):
        return config
    key = get_encryption_key()
    for item in items:
        if not isinstance(item, dict):
            continue
        pwd = item.get("password")
        if pwd and isinstance(pwd, str) and pwd.startswith(_ENC_PREFIX):
            try:
                item["password"] = CryptoUtils.decrypt(pwd[len(_ENC_PREFIX):], key)
            except Exception as e:  # noqa: BLE001
                logger.error("系统信息密码解密失败: %s" % e)
                item["password"] = ""
    return config


def _mask_system_info(config: dict) -> dict:
    """列表接口脱敏：密码统一显示为 ******，避免批量泄露。"""
    if not isinstance(config, dict):
        return config
    items = config.get("system_info")
    if not isinstance(items, list):
        return config
    for item in items:
        if isinstance(item, dict) and item.get("password"):
            item["password"] = "******"
    return config


def _validate_u_position(conn, rack_id, u_start, u_height, exclude_id=None):
    """U 位严格校验（不允许重复占用、不允许超出机柜总 U 数）。

    校验规则：
    1. u_start >= 1 且 u_height >= 1；
    2. rack_id 必须是已存在的机柜（否则 U 位无从校验，且前端机柜视图看不到该设备）；
    3. u_start + u_height - 1 <= 机柜 total_u（U 高不得超出机柜总 U 数）；
    4. 占用区间 [u_start, u_start+u_height-1] 不得与同机柜其他资产重叠。
    校验不通过抛出 ValueError，由路由层转为 400 返回给前端。

    并发说明：本函数只做「读」，调用方必须已在同一连接上开启 BEGIN IMMEDIATE
    写事务（见 create_asset / update_asset），使「校验 → 写入」整体串行化，
    否则两个并发请求可能同时通过校验后写入同一 U 位（TOCTOU 竞态）。
    """
    if not rack_id or u_start in (None, ""):
        return
    try:
        s1 = int(u_start)
        h1 = int(u_height or 1)
    except (TypeError, ValueError):
        raise ValueError("U位/U高必须为数字")
    if s1 < 1:
        raise ValueError("起始U位必须 ≥ 1")
    if h1 < 1:
        raise ValueError("U高必须 ≥ 1")
    e1 = s1 + h1 - 1
    # 机柜总 U 数越界校验
    rack = conn.execute(
        "SELECT name, total_u FROM racks WHERE rack_id=?", (str(rack_id),)
    ).fetchone()
    if not rack:
        raise ValueError("机柜「%s」不存在，请先创建该机柜或清空机柜/U位字段" % rack_id)
    total_u = int(rack["total_u"] or 42)
    if e1 > total_u:
        raise ValueError(
            "U位 %d–%d 超出机柜「%s」总U数（%dU），请调整起始U位或U高"
            % (s1, e1, rack["name"] or rack_id, total_u)
        )
    # U 位冲突校验（与同机柜其他资产区间重叠即拒绝）
    rows = conn.execute(
        "SELECT id, name, u_start, u_height FROM assets WHERE rack_id=? AND u_start IS NOT NULL",
        (rack_id,),
    ).fetchall()
    for r in rows:
        rid = r["id"]
        if exclude_id is not None and rid == exclude_id:
            continue
        try:
            s2 = int(r["u_start"])
            h2 = int(r["u_height"] or 1)
        except (TypeError, ValueError):
            continue
        e2 = s2 + h2 - 1
        if s1 <= e2 and s2 <= e1:  # 区间重叠 → 拒绝保存
            raise ValueError(
                "U位 %d–%d 已被资产「%s」占用（%d–%dU），请选择其他U位"
                % (s1, e1, r["name"] or ("ID=%d" % rid), s2, e2)
            )


def _asset_no_conflict(e: sqlite3.IntegrityError) -> bool:
    """判断该完整性错误是否为 assets.asset_no 唯一约束冲突（可重试/可提示改编号）。"""
    msg = str(e).lower()
    return "unique" in msg and "asset_no" in msg


def _integrity_to_value_error(e: sqlite3.IntegrityError, asset_no) -> ValueError:
    """把 sqlite3 完整性错误翻译成可读的 ValueError（路由层转 400，不再一律 500）。

    仅当确实是唯一约束冲突时才提示「编号已存在」，NOT NULL / 外键等其它约束
    分别给出对应提示，避免把任何 IntegrityError 都误判为编号冲突。
    """
    msg = str(e)
    low = msg.lower()
    if _asset_no_conflict(e):
        return ValueError("资产编号「%s」已存在，请更换编号" % (asset_no or ""))
    if "unique" in low:
        return ValueError("唯一约束冲突，数据重复：%s" % msg)
    if "not null" in low:
        return ValueError("必填字段缺失（数据库非空约束）：%s" % msg)
    if "foreign key" in low:
        return ValueError("关联数据不存在（外键约束）：%s" % msg)
    return ValueError("数据完整性校验失败：%s" % msg)


def create_asset(data: dict) -> int:
    name = data.get("name")
    if not (str(name).strip() if name is not None else ""):
        raise ValueError("资产名称(name)为必填项")
    conn = common._connect()
    try:
        # BEGIN IMMEDIATE：立即取写锁，使「U 位校验 → 写入」在并发下串行执行，
        # 消除两个请求同时通过校验后写入同一 U 位的 TOCTOU 竞态。
        conn.execute("BEGIN IMMEDIATE")
        is_net = 1 if data.get("is_network_device") else 0
        data["config"] = _encrypt_system_info(data.get("config") or {})
        _validate_u_position(conn, data.get("rack_id"), data.get("u_start"), data.get("u_height"))
        asset_no = data.get("asset_no")
        if not asset_no:
            # 自动生成资产编号：极小概率与既有编号冲突（UNIQUE 约束），最多重试 5 次
            cur = None
            for _ in range(5):
                try:
                    asset_no = common._gen_asset_no(data.get("category", "IT设备"))
                    cur = conn.execute(
                        """INSERT INTO assets
                           (asset_no, name, category, subtype, user, dept, location, status,
                            brand, model, sn, color, storage, memory,
                            contract_no, supplier, purchase_date, price,
                            warranty_months, warranty_expire, note, rack_id, u_start, u_height,
                            is_network_device, config, inventory_time)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (
                            asset_no, data.get("name"), data.get("category", "IT设备"),
                            data.get("subtype"), data.get("user"), data.get("dept"),
                            data.get("location"), data.get("status", "在库"),
                            data.get("brand"), data.get("model"), data.get("sn"),
                            data.get("color"), data.get("storage"), data.get("memory"),
                            data.get("contract_no"), data.get("supplier"),
                            data.get("purchase_date"), float(data.get("price") or 0),
                            int(data.get("warranty_months") or 0), data.get("warranty_expire"),
                            data.get("note"), data.get("rack_id") or None,
                            data.get("u_start"), data.get("u_height"), is_net,
                            json.dumps(data.get("config") or {}, ensure_ascii=False),
                            data.get("inventory_time") or None,
                        ),
                    )
                    break
                except sqlite3.IntegrityError as e:
                    # 仅编号撞车才重试；NOT NULL / 外键等其它约束立即报错，避免空转 5 次后误报编号冲突
                    if not _asset_no_conflict(e):
                        raise _integrity_to_value_error(e, asset_no)
                    continue
            if cur is None:
                raise ValueError("资产编号自动生成连续冲突，请手动指定 asset_no")
        else:
            cur = _insert_with_asset_no(conn, data, asset_no, is_net)
        conn.commit()
        aid = cur.lastrowid
        # 显式声明为网络设备时即使暂无端口也保留标记（否则端口区永远不显示）
        _ports._replace_ports(conn, aid, data.get("ports") or [], is_network_device=bool(is_net))
        conn.commit()
        return aid
    finally:
        conn.close()


def _insert_with_asset_no(conn, data: dict, asset_no, is_net: int):
    """按调用方指定的 asset_no 插入资产；完整性错误翻译为可读 ValueError。"""
    try:
        return conn.execute(
            """INSERT INTO assets
               (asset_no, name, category, subtype, user, dept, location, status,
                brand, model, sn, color, storage, memory,
                contract_no, supplier, purchase_date, price,
                warranty_months, warranty_expire, note, rack_id, u_start, u_height,
                is_network_device, config, inventory_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                asset_no, data.get("name"), data.get("category", "IT设备"),
                data.get("subtype"), data.get("user"), data.get("dept"),
                data.get("location"), data.get("status", "在库"),
                data.get("brand"), data.get("model"), data.get("sn"),
                data.get("color"), data.get("storage"), data.get("memory"),
                data.get("contract_no"), data.get("supplier"),
                data.get("purchase_date"), float(data.get("price") or 0),
                int(data.get("warranty_months") or 0), data.get("warranty_expire"),
                data.get("note"), data.get("rack_id") or None,
                data.get("u_start"), data.get("u_height"), is_net,
                json.dumps(data.get("config") or {}, ensure_ascii=False),
                data.get("inventory_time") or None,
            ),
        )
    except sqlite3.IntegrityError as e:
        raise _integrity_to_value_error(e, asset_no)


def get_asset(asset_id: int) -> Optional[dict]:
    conn = common._connect()
    try:
        row = conn.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
        if not row:
            return None
        asset = common._row_to_asset(conn, row)
        asset["config"] = _decrypt_system_info(asset.get("config") or {})
        return asset
    finally:
        conn.close()


def list_assets(page: int = 1, size: int = 20, search: str = None,
                category: str = None, exclude_category: str = None,
                exclude_rack: bool = True,
                sort_by: str = "id", sort_order: str = "desc",
                filter_col: str = None, filter_values: list = None) -> Tuple[List[dict], int]:
    conn = common._connect()
    try:
        _SORT_KEYS = ("id", "asset_no", "name", "category", "subtype", "brand", "color",
                      "user", "status", "warranty_expire", "inventory_time", "location",
                      "rack_id", "sn", "dept", "storage", "memory", "purchase_date", "created_at")
        sb = sort_by if sort_by in _SORT_KEYS else "id"
        so = "DESC" if (sort_order or "").lower() != "asc" else "ASC"
        wheres = []
        params = []
        if exclude_rack:
            # 机柜正常存放在 racks 表，assets 表理论上不会出现 category='机柜'；
            # 此条件是对「CSV 导入/备份还原可写入任意 category 文本」的防御性过滤，
            # 用于兜住历史脏数据，正常库上恒为真、不影响结果。
            wheres.append("category <> '机柜'")
        if search:
            wheres.append("(name LIKE ? OR asset_no LIKE ? OR user LIKE ? OR dept LIKE ? OR location LIKE ? OR sn LIKE ? OR color LIKE ? OR storage LIKE ? OR memory LIKE ?)")
            like = "%" + search + "%"
            params.extend([like, like, like, like, like, like, like, like, like])
        if category:
            wheres.append("category = ?")
            params.append(category)
        if exclude_category:
            wheres.append("category <> ?")
            params.append(exclude_category)
        if filter_col in _SORT_KEYS and filter_values:
            ph = ",".join("?" * len(filter_values))
            wheres.append("%s IN (%s)" % (filter_col, ph))
            params += list(filter_values)
        where_sql = (" WHERE " + " AND ".join(wheres)) if wheres else ""
        total = conn.execute("SELECT COUNT(*) AS c FROM assets" + where_sql, params).fetchone()["c"]
        offset = (page - 1) * size
        rows = conn.execute(
            "SELECT * FROM assets" + where_sql + " ORDER BY %s %s LIMIT ? OFFSET ?" % (sb, so),
            params + [size, offset],
        ).fetchall()
        out = [common._row_to_asset(conn, r) for r in rows]
        for a in out:
            a["config"] = _mask_system_info(a.get("config") or {})
        return out, total
    finally:
        conn.close()


def update_asset(asset_id: int, data: dict) -> bool:
    conn = common._connect()
    try:
        # 与 create_asset 同理：先取写锁再读取/校验/写入，避免 U 位 TOCTOU 竞态
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT id, rack_id, u_start, u_height FROM assets WHERE id=?", (asset_id,)
        ).fetchone()
        if not existing:
            return False
        if "name" in data and not (str(data["name"]).strip() if data["name"] is not None else ""):
            raise ValueError("资产名称(name)不能为空")
        # 资产编号可修改：非空校验 + UNIQUE 冲突检测（禁止保存为已存在的编号）
        if "asset_no" in data:
            ano = data["asset_no"]
            ano = str(ano).strip() if ano is not None else ""
            if not ano:
                raise ValueError("资产编号(asset_no)不能为空")
            dup = conn.execute(
                "SELECT id FROM assets WHERE asset_no=? AND id<>?", (ano, asset_id)
            ).fetchone()
            if dup:
                raise ValueError("资产编号已存在：%s" % ano)
        # U 位严格校验：以「本次请求值 + 库内现值」合并后的最终位置为准。
        # 旧实现只在请求同时带 rack_id 与 u_start 时才校验，导致仅提交 u_start
        # （或仅改 u_height）即可绕过校验写入冲突/越界 U 位。
        eff_rack = data.get("rack_id") if "rack_id" in data else existing["rack_id"]
        eff_start = data.get("u_start") if "u_start" in data else existing["u_start"]
        eff_height = data.get("u_height") if "u_height" in data else existing["u_height"]
        touch_u = any(k in data for k in ("rack_id", "u_start", "u_height"))
        if touch_u and eff_rack and eff_start not in (None, ""):
            _validate_u_position(conn, eff_rack, eff_start, eff_height, exclude_id=asset_id)
        fields = []
        params = []
        mapping = {
            "asset_no": "asset_no", "name": "name", "category": "category", "subtype": "subtype",
            "user": "user", "dept": "dept", "location": "location", "status": "status",
            "brand": "brand", "model": "model", "sn": "sn",
            "color": "color", "storage": "storage", "memory": "memory",
            "contract_no": "contract_no",
            "supplier": "supplier", "purchase_date": "purchase_date", "warranty_expire": "warranty_expire",
            "note": "note", "rack_id": "rack_id", "u_start": "u_start", "u_height": "u_height",
            "inventory_time": "inventory_time",
        }
        for k, col in mapping.items():
            if k in data:
                fields.append("%s=?" % col)
                params.append(data[k])
        if "price" in data:
            fields.append("price=?")
            params.append(float(data["price"] or 0))
        if "warranty_months" in data:
            fields.append("warranty_months=?")
            params.append(int(data["warranty_months"] or 0))
        if "is_network_device" in data:
            fields.append("is_network_device=?")
            params.append(1 if data["is_network_device"] else 0)
        if "config" in data:
            fields.append("config=?")
            params.append(json.dumps(_encrypt_system_info(data["config"] or {}), ensure_ascii=False))
        if fields:
            fields.append("updated_at=?")
            params.append(common._now())
            params.append(asset_id)
            conn.execute("UPDATE assets SET " + ", ".join(fields) + " WHERE id=?", params)
        if "ports" in data:
            # 请求显式带 is_network_device 时以其为准；否则沿用「清空端口即复位」的旧语义
            _ports._replace_ports(conn, asset_id, data["ports"],
                                  is_network_device=data.get("is_network_device"))
        conn.commit()
        return True
    finally:
        conn.close()


def delete_asset(asset_id: int) -> bool:
    conn = common._connect()
    try:
        cur = conn.execute("DELETE FROM assets WHERE id=?", (asset_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def batch_delete_assets(ids) -> int:
    """批量删除资产。

    仅删除传入 id 列表内、且确实存在的资产；不存在的 id 静默跳过。
    ports 表通过 ON DELETE CASCADE 随资产一并删除。
    返回实际删除的条数。ids 为空/非法时抛出 ValueError（由路由层转 400）。
    """
    if not isinstance(ids, list) or not ids:
        raise ValueError("请传入非空 id 列表")
    clean_ids = []
    for i in ids:
        try:
            clean_ids.append(int(i))
        except (TypeError, ValueError):
            continue
    if not clean_ids:
        raise ValueError("ids 必须为整数列表")
    conn = common._connect()
    try:
        # BEGIN IMMEDIATE 取写锁，使批量删除在并发下串行执行，避免与单条删除竞态
        conn.execute("BEGIN IMMEDIATE")
        placeholders = ",".join("?" * len(clean_ids))
        cur = conn.execute(
            "DELETE FROM assets WHERE id IN (%s)" % placeholders, clean_ids
        )
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def batch_update_inventory_time(ids: List[int], inventory_time: str) -> int:
    """批量更新资产的盘点时间（inventory_time）。

    仅更新传入 id 列表内、且确实存在的资产；不存在的 id 静默跳过。
    更新同时刷新 updated_at。返回实际更新的条数。

    inventory_time 必须为 YYYY-MM-DD 格式的合法日期，否则抛出 ValueError
    （由路由层转 400），避免写入脏数据到盘点时间字段。
    """
    if not isinstance(ids, list) or not ids:
        raise ValueError("ids 不能为空")
    # 规整为整数 id，过滤掉无法转换的非法值
    clean_ids = []
    for i in ids:
        try:
            clean_ids.append(int(i))
        except (TypeError, ValueError):
            continue
    if not clean_ids:
        raise ValueError("ids 必须为整数列表")
    # 日期格式与合法性校验（拒绝 2026-13-45 这类非法日期）
    if not isinstance(inventory_time, str) or not inventory_time.strip():
        raise ValueError("盘点时间不能为空，格式应为 YYYY-MM-DD")
    try:
        datetime.strptime(inventory_time, "%Y-%m-%d")
    except ValueError:
        raise ValueError("盘点时间格式应为 YYYY-MM-DD")
    conn = common._connect()
    try:
        # BEGIN IMMEDIATE 取写锁，使批量更新在并发下串行执行，避免与单条更新竞态
        conn.execute("BEGIN IMMEDIATE")
        placeholders = ",".join("?" * len(clean_ids))
        cur = conn.execute(
            "UPDATE assets SET inventory_time=?, updated_at=? WHERE id IN (%s)" % placeholders,
            [inventory_time, common._now()] + clean_ids,
        )
        updated = cur.rowcount
        conn.commit()
        return updated
    finally:
        conn.close()
