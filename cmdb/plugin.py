"""
plugins/cmdb/plugin.py - CMDB 资产配置管理插件入口

功能：继承 BasePlugin，注册菜单与 /api/cmdb 路由。
实现：资产仪表盘、IT 资产、办公/实物资产与机柜 U 位、端口拓扑、维保管理、报表中心。
数据持久化于 plugins/cmdb/data/cmdb.db（SQLite）。
"""
import csv
import html
import io
import json
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, JSONResponse, Response

from core.audit import audit_log
from core.auth import get_current_user
from core.logger import get_logger
from plugins.base_plugin import BasePlugin
from plugins.cmdb import common
from plugins.cmdb.modules import assets, racks, ports, dashboard, maintenance, reports, backup, import_csv

logger = get_logger()


def _esc(value) -> str:
    """HTML 转义：资产名称/备注等均为用户可写内容，未转义会形成存储型 XSS。"""
    return html.escape("" if value is None else str(value), quote=True)


def _build_report_html(title: str, headers: List[str], rows: List[list]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    trs = []
    for r in rows:
        tds = "".join("<td>%s</td>" % _esc(c) for c in r)
        trs.append("<tr>%s</tr>" % tds)
    table = "".join(trs)
    head = "".join("<th>%s</th>" % _esc(h) for h in headers)
    safe_title = _esc(title)
    return """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>CMDB - %s</title></head><body style="font-family:-apple-system,'Segoe UI',sans-serif;padding:24px;">
<h2>CMDB - %s</h2>
<p style="color:;">生成时间：%s　记录数：%d</p>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%%;font-size:13px;">
<thead style="background:#4361ee;color:#fff;"><tr>%s</tr></thead><tbody>%s</tbody></table>
<p style="color:;margin-top:16px;">本报告由 NetCore Framework CMDB 插件自动生成。</p>
</body></html>""" % (safe_title, safe_title, now, len(rows), head, table)


class CMDBPlugin(BasePlugin):
    """CMDB 资产配置管理插件"""

    def get_metadata(self) -> Dict[str, str]:
        return {
            "name": "cmdb",
            # IT 资产详情-系统信息取消「密码」模块（移除显示密码按钮与密码列，
            # 密码已加密存储且不再展示，防敏感信息泄漏）
            "version": "20260824-V2",
            "description": "资产配置管理（CMDB）：资产台账、机柜 U 位、维保与报表",
            "author": "NetCore Team",
        }

    def on_load(self) -> bool:
        first_run = common.init_db()
        if first_run:
            common.seed_if_empty(force=True)
        logger.info("CMDB 插件加载完成")
        return True

    def get_routes(self) -> Optional[APIRouter]:
        router = APIRouter(prefix="/api/cmdb")

        # ---------------- 仪表盘 ----------------
        @router.get("/dashboard")
        async def route_dashboard(user: str = Depends(get_current_user)):
            return dashboard.dashboard_stats()

        # ---------------- 资产 ----------------
        @router.get("/assets")
        async def list_assets(
            page: int = Query(1, ge=1),
            size: int = Query(20, ge=1, le=10000),
            search: str = None,
            category: str = None,
            exclude_category: str = None,
            sort_by: str = "id",
            sort_order: str = "desc",
            filter_col: str = None,
            filter_values: List[str] = Query(None),
            user: str = Depends(get_current_user),
        ):
            result, total = assets.list_assets(page=page, size=size, search=search,
                                               category=category, exclude_category=exclude_category,
                                               sort_by=sort_by, sort_order=sort_order,
                                               filter_col=filter_col, filter_values=filter_values)
            return {"assets": result, "total": total}

        @router.post("/assets")
        async def create_asset(req: dict, user: str = Depends(get_current_user)):
            try:
                aid = assets.create_asset(req)
            except ValueError as e:  # 名称为空 / 编号重复 / U 位冲突或超限等校验失败
                return JSONResponse(status_code=400, content={"success": False, "detail": str(e)})
            asset = assets.get_asset(aid) or {}
            audit_log("cmdb_asset_add", "新增资产: %s (%s)" % (asset.get("name"), asset.get("asset_no")), "success", username=user)
            return {"success": True, "id": aid, "asset_no": asset.get("asset_no")}

        # ---------------- 批量更新盘点时间（须在 /assets/{asset_id} 之前注册） ----------------
        @router.post("/assets/batch-update")
        async def batch_update_inventory(req: dict, user: str = Depends(get_current_user)):
            """批量更新资产盘点时间。请求体：{"ids":[int...], "inventory_time":"YYYY-MM-DD"}。"""
            ids = req.get("ids")
            if not isinstance(ids, list) or not ids:
                return JSONResponse(status_code=400, content={"success": False, "detail": "请传入非空 id 列表"})
            inventory_time = req.get("inventory_time")
            try:
                n = assets.batch_update_inventory_time(ids, inventory_time)
            except ValueError as e:  # 日期格式非法 / ids 非法
                return JSONResponse(status_code=400, content={"success": False, "detail": str(e)})
            audit_log(
                "cmdb_asset_batch_inventory",
                "批量更新盘点时间：%d 台资产 -> %s" % (n, inventory_time),
                "success", username=user,
            )
            return {"success": True, "updated": n}

        # ---------------- 批量删除资产（须在 /assets/{asset_id} 之前注册） ----------------
        @router.post("/assets/batch-delete")
        async def batch_delete(req: dict, user: str = Depends(get_current_user)):
            """批量删除资产。请求体：{"ids":[int...]}。"""
            ids = req.get("ids")
            if not isinstance(ids, list) or not ids:
                return JSONResponse(status_code=400, content={"success": False, "detail": "请传入非空 id 列表"})
            try:
                n = assets.batch_delete_assets(ids)
            except ValueError as e:
                return JSONResponse(status_code=400, content={"success": False, "detail": str(e)})
            audit_log("cmdb_asset_batch_delete", "批量删除资产：%d 台" % n, "success", username=user)
            return {"success": True, "deleted": n}

        # ---------------- CSV 批量导入（须注册在 /assets/{asset_id} 之前） ----------------
        @router.get("/assets/import-template")
        async def assets_import_template(user: str = Depends(get_current_user)):
            """下载 CSV 导入模板（首部 # 注释行说明各列填写方法）。"""
            return Response(
                content="\ufeff" + import_csv.get_template(),
                media_type="text/csv; charset=utf-8",
                headers={"Content-Disposition": "attachment; filename=cmdb_import_template.csv"},
            )

        @router.post("/assets/import-csv")
        async def assets_import_csv(req: dict, user: str = Depends(get_current_user)):
            """CSV 批量导入资产。请求体：{"content": <CSV 文本>}。"""
            result = import_csv.import_csv(req.get("content") or "")
            if not result.get("success"):
                return JSONResponse(status_code=400, content=result)
            audit_log("cmdb_asset_import", "CSV 导入资产：成功 %d，失败 %d" % (
                result.get("added", 0), result.get("failed", 0)), "success", username=user)
            return result

        @router.get("/assets/{asset_id}")
        async def get_asset(asset_id: int, user: str = Depends(get_current_user)):
            asset = assets.get_asset(asset_id)
            if not asset:
                from fastapi.responses import JSONResponse
                return JSONResponse(status_code=404, content={"detail": "资产不存在"})
            return asset

        @router.put("/assets/{asset_id}")
        async def update_asset(asset_id: int, req: dict, user: str = Depends(get_current_user)):
            try:
                ok = assets.update_asset(asset_id, req)
            except ValueError as e:  # U 位冲突 / 超限等校验失败
                return JSONResponse(status_code=400, content={"success": False, "detail": str(e)})
            if ok:
                audit_log("cmdb_asset_update", "更新资产 ID=%d" % asset_id, "success", username=user)
            return {"success": ok}

        @router.delete("/assets/{asset_id}")
        async def delete_asset(asset_id: int, user: str = Depends(get_current_user)):
            ok = assets.delete_asset(asset_id)
            if ok:
                audit_log("cmdb_asset_delete", "删除资产 ID=%d" % asset_id, "success", username=user)
            return {"success": ok}

        # ---------------- 端口 ----------------
        @router.get("/assets/{asset_id}/ports")
        async def get_ports(asset_id: int, user: str = Depends(get_current_user)):
            return {"ports": ports.get_ports(asset_id)}

        @router.put("/assets/{asset_id}/ports")
        async def set_ports(asset_id: int, req: dict, user: str = Depends(get_current_user)):
            if assets.get_asset(asset_id) is None:
                from fastapi.responses import JSONResponse
                return JSONResponse(status_code=404, content={"detail": "资产不存在"})
            assets.update_asset(asset_id, {"ports": req.get("ports", [])})
            audit_log("cmdb_port_update", "更新端口配置 资产ID=%d" % asset_id, "success", username=user)
            return {"success": True}

        # ---------------- 机柜 ----------------
        @router.get("/racks")
        async def list_racks(user: str = Depends(get_current_user)):
            return {"racks": racks.list_racks()}

        @router.get("/racks/{rack_id}")
        async def get_rack(rack_id: str, user: str = Depends(get_current_user)):
            rack = racks.get_rack(rack_id)
            if not rack:
                from fastapi.responses import JSONResponse
                return JSONResponse(status_code=404, content={"detail": "机柜不存在"})
            return rack

        @router.post("/racks")
        async def create_rack(req: dict, user: str = Depends(get_current_user)):
            if not (req.get("rack_id") or "").strip():
                return JSONResponse(status_code=400, content={"detail": "机柜编号(rack_id)为必填项"})
            if racks.get_rack(req["rack_id"]) is not None:
                return JSONResponse(status_code=400, content={"detail": "机柜编号已存在"})
            rid = racks.create_rack(req)
            audit_log("cmdb_rack_add", "新增机柜: %s" % req.get("rack_id"), "success", username=user)
            return {"success": True, "id": rid}

        @router.put("/racks/{rack_id}")
        async def update_rack(rack_id: str, req: dict, user: str = Depends(get_current_user)):
            if racks.get_rack(rack_id) is None:
                return JSONResponse(status_code=404, content={"detail": "机柜不存在"})
            try:
                ok = racks.update_rack(rack_id, req)
            except ValueError as e:  # 调小总U数会让已上架设备越界
                return JSONResponse(status_code=400, content={"success": False, "detail": str(e)})
            if ok:
                audit_log("cmdb_rack_update", "更新机柜: %s" % rack_id, "success", username=user)
            return {"success": ok}

        @router.delete("/racks/{rack_id}")
        async def delete_rack(rack_id: str, force: int = 0, user: str = Depends(get_current_user)):
            """删除机柜。机柜内仍有设备时默认拒绝，force=1 则先解绑下架再删。

            解绑只清空资产的 rack_id/u_start/u_height，**资产台账保留**，
            避免删机柜连带丢失设备台账（不可逆）。
            """
            res = racks.delete_rack(rack_id, force=bool(force))
            if res.get("not_found"):
                return JSONResponse(status_code=404, content={"detail": "机柜不存在"})
            if not res.get("ok"):
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "devices": res.get("devices", 0),
                    "detail": "机柜内还有 %d 台已上架设备，请先移出设备，或确认后连同解绑下架再删除"
                              % res.get("devices", 0),
                })
            audit_log(
                "cmdb_rack_delete",
                "删除机柜: %s（解绑下架设备 %d 台，资产台账保留）" % (rack_id, res.get("unbound", 0)),
                "success", username=user,
            )
            return {"success": True, "unbound": res.get("unbound", 0)}

        @router.post("/assets/{asset_id}/unbind-rack")
        async def unbind_asset_rack(asset_id: int, user: str = Depends(get_current_user)):
            """将设备移出机柜（仅解绑 U 位，资产台账保留）。"""
            if assets.get_asset(asset_id) is None:
                return JSONResponse(status_code=404, content={"detail": "资产不存在"})
            ok = racks.unbind_asset(asset_id)
            if ok:
                audit_log("cmdb_asset_unbind", "资产 ID=%d 移出机柜（仅解绑U位）" % asset_id,
                          "success", username=user)
            return {"success": ok}

        # ---------------- 维保管理 ----------------
        @router.get("/maintenance")
        async def route_maintenance(user: str = Depends(get_current_user)):
            return maintenance.maintenance_lists()

        # ---------------- 报表导出 ----------------
        @router.get("/reports/export")
        async def reports_export(
            type: str = "inventory",
            format: str = "html",
            user: str = Depends(get_current_user),
        ):
            if type == "dept":
                rows = reports.report_by_dept()
                headers = ["部门", "资产数", "原值合计(¥)"]
                data = [[r["dept"], r["cnt"], r["total"]] for r in rows]
                title = "部门资产汇总表"
            elif type == "warranty":
                m = maintenance.maintenance_lists()
                rows = m["expiring"] + m["normal"]
                headers = ["资产编号", "名称", "供应商", "合同号", "保修到期", "剩余天数", "状态"]
                data = [[r["asset_no"], r["name"], r.get("supplier"), r.get("contract_no"),
                         r.get("warranty_expire"), r.get("days_left"),
                         "即将到期" if r.get("days_left", 9999) <= 30 else "正常"] for r in rows]
                title = "维保到期预警报表"
            else:
                rows = reports.report_inventory()
                headers = ["资产编号", "名称", "分类", "子类", "使用人", "部门", "位置", "状态", "原值(¥)", "保修到期"]
                data = [[r["asset_no"], r["name"], r["category"], r["subtype"], r["user"],
                         r["dept"], r["location"], r["status"], r["price"], r["warranty_expire"]] for r in rows]
                title = "资产盘点报表"
            if format == "csv":
                buf = io.StringIO()
                w = csv.writer(buf)
                w.writerow(headers)
                for r in data:
                    w.writerow(r)
                # 带 UTF-8 BOM 并声明 charset，否则 Excel 打开中文报表会乱码（与导入模板保持一致）
                return Response(content="\ufeff" + buf.getvalue(),
                                media_type="text/csv; charset=utf-8",
                                headers={"Content-Disposition": "attachment; filename=cmdb_%s.csv" % type})
            return HTMLResponse(content=_build_report_html(title, headers, data))

        # ---------------- 数据备份 / 恢复（全量导入导出） ----------------
        @router.get("/backup/export")
        async def backup_export(user: str = Depends(get_current_user)):
            """导出全部设备与机柜为 JSON 备份文件（含端口，可完整还原）。"""
            data = backup.export_all()
            meta = data.get("meta", {})
            audit_log(
                "cmdb_backup_export",
                "导出全量备份（资产 %d，机柜 %d）" % (meta.get("asset_count", 0), meta.get("rack_count", 0)),
                "success", username=user,
            )
            content = json.dumps(data, ensure_ascii=False, indent=2)
            fname = "cmdb_backup_%s.json" % datetime.now().strftime("%Y%m%d_%H%M%S")
            return Response(
                content=content,
                media_type="application/json; charset=utf-8",
                headers={"Content-Disposition": "attachment; filename=%s" % fname},
            )

        @router.post("/backup/import")
        async def backup_import(req: dict, user: str = Depends(get_current_user)):
            """从上传的 JSON 备份内容恢复。

            请求体：{"content": <备份文件文本>, "mode": "merge"|"overwrite"}
            前端读取文件文本后以 JSON body 提交（沿用框架既有批量导入约定）。
            """
            content = req.get("content")
            mode = req.get("mode", "merge")
            if mode not in ("merge", "overwrite"):
                mode = "merge"
            if not content:
                return JSONResponse(status_code=400, content={"success": False, "message": "未提供备份内容"})
            try:
                data = json.loads(content) if isinstance(content, str) else content
            except Exception as e:  # noqa: BLE001
                return JSONResponse(status_code=400, content={"success": False, "message": "JSON 解析失败：%s" % e})
            result = backup.import_all(data, mode=mode)
            if result.get("success"):
                audit_log(
                    "cmdb_backup_import",
                    "导入备份 mode=%s 新增%d 更新%d 跳过%d" % (
                        mode, result.get("added", 0), result.get("updated", 0), result.get("skipped", 0)),
                    "success", username=user,
                )
            else:
                return JSONResponse(status_code=400, content=result)
            return result


        return router

    def get_menus(self) -> List[Dict]:
        return [{
            "id": "cmdb",
            "label": "CMDB 资产管理",
            "icon": "doc",
            "children": [
                {"id": "cmdb_dashboard", "label": "资产仪表盘", "icon": "dashboard", "path": "/cmdb/dashboard"},
                {"id": "cmdb_it", "label": "IT 资产", "icon": "guardian", "path": "/cmdb/it-assets"},
                {"id": "cmdb_physical", "label": "办公/实物资产", "icon": "doc", "path": "/cmdb/physical"},
                {"id": "cmdb_maintenance", "label": "维保管理", "icon": "setting", "path": "/cmdb/maintenance"},
                {"id": "cmdb_reports", "label": "报表中心", "icon": "doc", "path": "/cmdb/reports"},
            ],
        }]
