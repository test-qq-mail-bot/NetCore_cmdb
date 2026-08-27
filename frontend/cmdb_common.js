/* =====================================================================
 * cmdb_common.js - CMDB 插件公共配置（样式注入 + 子类选项 + 二维码工具）
 *
 * 组件已拆分到独立文件：
 *   cmdb_asset_form.js   -> CmdbAssetForm
 *   cmdb_asset_detail.js -> CmdbAssetDetail
 *   cmdb_page_header.js  -> CmdbPageHeader
 * ===================================================================== */

/* ---------- 各资产分类的常用子类选项（下拉可选、可输入自定义） ---------- */
window.CMDB_SUBTYPE_OPTIONS = {
    'IT设备': ['服务器', '交换机', '路由器', '防火墙', 'AP', '笔记本', '台式机', '显示器', '打印机', '手机', '平板', 'UPS', '存储设备', '安防监控', '其他'],
    '办公家具': ['办公桌', '办公椅', '文件柜', '会议桌', '沙发', '货架', '保险柜', '白板', '其他'],
    '生产设备': ['机床', '生产线', '检测设备', '包装设备', '起重设备', '空压机', '焊接设备', '模具', '其他'],
};

/* ---------- 离线二维码工具：返回 dataURL（GIF），失败返回空串 ---------- */
window.CMDB_QR_DATAURL = function (text, cellSize) {
    try {
        if (typeof qrcode !== 'function') return '';
        var qr = qrcode(0, 'M');
        qr.addData(String(text || ''), 'Byte');
        qr.make();
        return qr.createDataURL(cellSize || 4, 2);
    } catch (e) { return ''; }
};

/* ---------- 一次性注入 CMDB 插件样式（仅注入一次，保持在插件目录内） ---------- */
(function () {
    if (document.getElementById('cmdb-plugin-style')) return;
    var css = [
        ".cmdb-stat{border-radius:16px;color:#fff;padding:18px 20px;margin-bottom:4px;box-shadow:0 4px 20px rgba(0,0,0,.08);}",
        ".cmdb-stat-label{font-size:13px;opacity:.85;}",
        ".cmdb-stat-num{font-size:2rem;font-weight:700;line-height:1.2;}",
        ".cmdb-stat-sub{font-size:12px;opacity:.85;margin-top:4px;}",
        ".cmdb-rack-card{border:2px solid #e9ecef;border-radius:12px;padding:14px;cursor:pointer;background:#fff;transition:.2s;height:100%;}",
        ".cmdb-rack-card:hover{border-color:#4361ee;box-shadow:0 4px 16px rgba(67,97,238,.12);}",
        ".cmdb-mini-slot{display:inline-block;width:10px;height:10px;border-radius:2px;margin:1px;}",
        ".cmdb-mini-slot.used{background:#28a745;}",
        ".cmdb-mini-slot.free{background:#e9ecef;}",
        ".cmdb-rack-unit{display:flex;align-items:center;gap:8px;overflow:hidden;border:1px solid #dee2e6;padding:8px 12px;margin:2px 0;border-radius:4px;font-size:13px;min-height:34px;}",
        ".cmdb-rack-unit .cmdb-u-main{flex:1 1 auto;min-width:0;overflow:hidden;}",
        ".cmdb-rack-unit .cmdb-u-actions{flex:0 0 auto;display:flex;gap:2px;flex-wrap:wrap;justify-content:flex-end;}",
        ".cmdb-rack-unit.occupied{background:#d4edda;border-color:#28a745;}",
        ".cmdb-rack-unit.occupied:hover{background:#c3e6cb;cursor:pointer;box-shadow:0 2px 8px rgba(40,167,69,.25);}",
        ".cmdb-rack-unit.empty{background:#f8f9fa;color:#adb5bd;}",
        ".cmdb-u-label{font-weight:700;min-width:36px;display:inline-block;color:#334155;}",
        ".cmdb-maint-alert{border-left:4px solid #dc3545;padding:10px 12px;background:#fff;margin-bottom:8px;border-radius:6px;font-size:13px;}",
        ".cmdb-maint-alert.warning{border-left-color:#f59e0b;}",
        ".cmdb-report-card{height:100%;}",
        ".text-danger{color:#dc3545;}",
        ".text-warning{color:#f59e0b;}",
        ".cmdb-page{--el-color-primary:#4361ee;--el-color-primary-light-3:#5a73f0;--el-color-primary-light-5:#8593f5;--el-color-primary-light-7:#b3bdf9;--el-color-primary-light-8:#c9d1fb;--el-color-primary-light-9:#e4e9fd;--el-color-primary-dark-2:#3651c4;}",
        ".cmdb-page .el-card{border-radius:16px;border:none;box-shadow:0 4px 20px rgba(15,23,42,.06);}",
        ".cmdb-page .el-card__header{font-weight:600;border-bottom:1px solid #eef1f6;}",
        ".cmdb-page .el-table th.el-table__cell{background:#f5f7fb;color:#1e293b;font-weight:600;}",
        ".cmdb-page .el-table{border-radius:12px;overflow:hidden;}",
        ".cmdb-page .el-button{transition:.18s;}",
        ".cmdb-stat{transition:transform .2s, box-shadow .2s;}",
        ".cmdb-stat:hover{transform:translateY(-3px);box-shadow:0 8px 28px rgba(67,97,238,.22);}",
        ".cmdb-ph{display:flex;align-items:center;gap:14px;margin-bottom:18px;}",
        ".cmdb-ph-bar{width:5px;height:34px;border-radius:4px;background:linear-gradient(135deg,#4361ee,#3651c4);}",
        ".cmdb-ph-title{font-size:20px;font-weight:700;color:#1e293b;display:flex;align-items:center;gap:8px;}",
        ".cmdb-ph-sub{font-size:13px;color:#64748b;margin-top:2px;}",
        ".cmdb-ph-actions{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}",
        ".cmdb-section-title{font-size:16px;font-weight:700;color:#1e293b;margin:6px 0 14px;padding-left:10px;border-left:4px solid #4361ee;}"
    ].join("");
    var st = document.createElement('style');
    st.id = 'cmdb-plugin-style';
    st.textContent = css;
    document.head.appendChild(st);
})();
