"""modules/import_csv.py - CMDB 资产 CSV 批量导入与模板生成

对标数通配置卫士的批量导入约定：
- 模板首部以 # 开头的注释行说明每列如何填写，导入时自动跳过 # 行与空行。
- 首个非注释行为表头，其余每行一条资产记录。
- name 为必填；asset_no 留空则自动生成；price/u_start/u_height 为数字。
"""
import csv
import io
from typing import Dict, List

from plugins.NetCore_cmdb.modules import assets

# CSV 列定义（顺序即模板列顺序）
CSV_COLUMNS = [
    "asset_no", "name", "category", "subtype", "user", "dept", "location",
    "status", "brand", "model", "sn", "contract_no", "supplier",
    "purchase_date", "price", "warranty_expire", "note",
    "rack_id", "u_start", "u_height",
]

# 命中这些子类的资产自动标记为网络设备（前端据此展示端口区）
NETWORK_SUBTYPES = ("交换机", "路由器", "防火墙", "AP", "无线AP")

TEMPLATE = """\
# CMDB 资产批量导入模板（CSV，UTF-8 编码）
# 使用说明：
# 1. 以 # 开头的行是注释，导入时自动忽略，可保留或删除。
# 2. 第一个非注释行必须是表头行（请勿修改列名与顺序）。
# 3. 每行一条资产记录，逗号分隔；字段内含逗号时请用英文双引号包裹。
# 各列填写说明：
# asset_no       资产编号，留空则系统自动生成
# name           资产名称，必填（如 核心交换机-01）
# category       分类：IT设备 / 办公家具 / 生产设备，留空默认 IT设备（其它值会被原样写入）
# subtype        子类（如 服务器 / 交换机 / 路由器 / 笔记本 / 打印机）
# user           使用人
# dept           所属部门
# location       存放位置（如 机房A区 / 3楼办公区）
# status         状态：在库 / 使用中 / 维修中 / 报废，留空默认 在库
# brand          品牌（如 华为 / 联想）
# model          型号（如 CE6857-48S6CQ-EI）
# sn             序列号
# contract_no    合同号
# supplier       供应商
# purchase_date  采购日期，格式 YYYY-MM-DD（如 2026-01-15）
# price          采购价格（数字，单位元，如 45000）
# warranty_expire 保修到期日，格式 YYYY-MM-DD
# note           备注
# rack_id        所在机柜编号（仅上架设备填写，必须是系统中已存在的机柜编号，如 CAB-A01；
#                填写不存在的机柜编号该行会导入失败）
# u_start        起始 U 位（数字，仅上架设备填写，如 10；不得与同机柜其它设备重叠）
# u_height       U 位高度（数字，仅上架设备填写，如 2；起始U位+U高-1 不得超过机柜总U数）
asset_no,name,category,subtype,user,dept,location,status,brand,model,sn,contract_no,supplier,purchase_date,price,warranty_expire,note,rack_id,u_start,u_height
核心交换机-01,IT设备,交换机,张三,网络部,机房A区,使用中,华为,CE6857-48S6CQ-EI,SN20260001,HT-2026-001,华为技术,2026-01-15,45000,2029-01-14,示例数据可删除（上架请填写已存在的机柜编号）,,,
办公笔记本-01,IT设备,笔记本,李四,行政部,3楼办公区,使用中,联想,ThinkPad T14,SN20260002,,联想授权店,2026-02-01,7500,2027-01-31,示例数据可删除,,,
"""


def get_template() -> str:
    return TEMPLATE


def import_csv(content: str) -> Dict:
    """解析 CSV 内容并逐行创建资产。

    返回 {"success": True, "added": n, "failed": m, "errors": [..]}
    """
    if not content or not content.strip():
        return {"success": False, "message": "CSV 内容为空"}
    # 去 BOM
    content = content.lstrip("\ufeff")
    lines = [ln for ln in content.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    if not lines:
        return {"success": False, "message": "未找到有效数据行（# 注释行会被忽略）"}
    reader = csv.reader(io.StringIO("\n".join(lines)))
    rows = list(reader)
    header = [h.strip().lstrip("\ufeff") for h in rows[0]]
    missing = [c for c in ("name",) if c not in header]
    if missing:
        return {"success": False, "message": "表头缺少必需列: %s（请使用官方模板）" % ",".join(missing)}
    added = 0
    failed = 0
    errors: List[str] = []
    for idx, row in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in row):
            continue
        rec = {header[i]: row[i].strip() for i in range(min(len(header), len(row)))}
        name = rec.get("name")
        if not name:
            errors.append("第%d行：name 为必填项，已跳过" % idx)
            failed += 1
            continue
        data = {
            "asset_no": rec.get("asset_no") or None,
            "name": name,
            "category": rec.get("category") or "IT设备",
            "subtype": rec.get("subtype") or None,
            "user": rec.get("user") or None,
            "dept": rec.get("dept") or None,
            "location": rec.get("location") or None,
            "status": rec.get("status") or "在库",
            "brand": rec.get("brand") or None,
            "model": rec.get("model") or None,
            "sn": rec.get("sn") or None,
            "contract_no": rec.get("contract_no") or None,
            "supplier": rec.get("supplier") or None,
            "purchase_date": rec.get("purchase_date") or None,
            "note": rec.get("note") or None,
            "rack_id": rec.get("rack_id") or None,
        }
        try:
            data["price"] = float(rec.get("price") or 0)
        except ValueError:
            errors.append("第%d行：price 不是有效数字，已按 0 处理" % idx)
            data["price"] = 0
        if rec.get("warranty_expire"):
            data["warranty_expire"] = rec["warranty_expire"]
        for numkey in ("u_start", "u_height"):
            val = rec.get(numkey)
            if val:
                try:
                    data[numkey] = int(val)
                except ValueError:
                    errors.append("第%d行：%s 不是有效整数，已忽略" % (idx, numkey))
        # 子类命中网络设备时打标记；取值与前端 CMDB_SUBTYPE_OPTIONS['IT设备'] 对齐
        # （下拉里是「AP」，旧代码只判断「无线AP」导致 AP 永远匹配不上）
        if data.get("subtype") in NETWORK_SUBTYPES:
            data["is_network_device"] = True
        try:
            assets.create_asset(data)
            added += 1
        except Exception as e:  # noqa: BLE001
            errors.append("第%d行：创建失败 - %s" % (idx, e))
            failed += 1
    # failed 只统计真正未入库的行；price/u_start 等可容错项仅作为提示写入 errors
    return {"success": True, "added": added, "failed": failed, "errors": errors}
