/* =====================================================================
 * cmdb_common.js - CMDB 插件共享组件（资产表单 + 资产详情/端口编辑器）
 *
 * 通过 window.NC.registerPage 注册为全局组件（框架会把 NC.PAGES 全部注册为
 * 全局 Vue 组件），供各页面以 <CmdbAssetForm> / <CmdbAssetDetail> 复用。
 * 不挂载任何菜单/路径，仅作为可复用对话框组件。
 *
 * 离线二维码：qrcode_lib.js（qrcode-generator, MIT）由框架自动注入，
 * 全局函数 qrcode() 可直接使用，无需任何后端接口。
 * ===================================================================== */

if (window.NC && window.NC.jsVersions) {
    window.NC.jsVersions['CmdbAssetForm'] = "";
    window.NC.jsVersions['CmdbAssetDetail'] = "";
    window.NC.jsVersions['CmdbPageHeader'] = "";
}

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
        ".cmdb-topo-node{display:inline-block;padding:8px 14px;border-radius:10px;background:#4361ee;color:#fff;font-weight:600;font-size:13px;}",
        ".cmdb-topo-line{display:inline-block;width:32px;height:3px;background:#6c757d;vertical-align:middle;margin:0 2px;}",
        ".cmdb-maint-alert{border-left:4px solid #dc3545;padding:10px 12px;background:#fff;margin-bottom:8px;border-radius:6px;font-size:13px;}",
        ".cmdb-maint-alert.warning{border-left-color:#f59e0b;}",
        ".cmdb-report-card{height:100%;}",
        ".text-danger{color:#dc3545;}",
        ".text-warning{color:#f59e0b;}",
        /* ---- 6/23 视觉升级：CMDB 作用域内统一主题 + 卡片美化 ---- */
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
        ".cmdb-section-title{font-size:16px;font-weight:700;color:#1e293b;margin:6px 0 14px;padding-left:10px;border-left:4px solid #4361ee;}",
        /* ---- 7/28 表单折叠美化 ---- */
        ".cmdb-form-main{background:#f8faff;border:1px solid #e4e9fd;border-radius:12px;padding:16px 16px 4px;margin-bottom:12px;}",
        ".cmdb-form-main-title{font-size:13px;font-weight:700;color:#4361ee;margin:0 0 12px;display:flex;align-items:center;gap:6px;}",
        ".cmdb-form-collapse{border:none;}",
        ".cmdb-form-collapse .el-collapse-item{border:1px solid #eef1f6;border-radius:10px;margin-bottom:8px;overflow:hidden;}",
        ".cmdb-form-collapse .el-collapse-item__header{padding:0 14px;font-weight:600;color:#1e293b;background:#fafbfe;border-bottom:none;}",
        ".cmdb-form-collapse .el-collapse-item__wrap{border-bottom:none;}",
        ".cmdb-form-collapse .el-collapse-item__content{padding:14px 14px 2px;}"
    ].join("");
    var st = document.createElement('style');
    st.id = 'cmdb-plugin-style';
    st.textContent = css;
    document.head.appendChild(st);
})();

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

/* ---------- 资产新建/编辑表单（含端口编辑） ---------- */
(function () {
    window.NC.registerPage('CmdbAssetForm', {
        mixins: [window.NC.SF_MIXIN],
template: `
        <style>
        /* CMDB 编辑资产响应式：手机（<=768px）与超小屏（<=480px）适配 */
        @media (max-width: 768px) {
            .cmdb-dialog .el-dialog { width: 96vw !important; margin-top: 4vh; }
            .cmdb-dialog .el-form-item__label { width: 84px !important; }
            .cmdb-dialog .el-form-item__content { margin-left: 84px !important; }
        }
        @media (max-width: 480px) {
            .cmdb-dialog .el-form-item__label { width: 70px !important; font-size: 12px; }
            .cmdb-dialog .el-form-item__content { margin-left: 70px !important; }
            .cmdb-dialog .el-table { font-size: 12px; }
            .cmdb-dialog .el-table .el-input__inner { font-size: 12px; }
        }
        </style>
        <el-dialog class="cmdb-dialog" v-model="visible" :title="isEdit ? '编辑资产' : '新设资产'"
                   width="90vw" top="4vh" destroy-on-close style="max-width:1280px;">
          <el-form :model="form" label-width="100px" size="default">
            <!-- 常用信息（默认展示的 6 项） -->
            <div class="cmdb-form-main">
              <div class="cmdb-form-main-title">常用信息</div>
              <el-row :gutter="12" v-if="categoryOptions.length > 1">
                <el-col :span="12">
                  <el-form-item label="资产分类" required>
                    <el-select v-model="form.category" style="width:100%" @change="onCategoryChange">
                      <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c"></el-option>
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="12">
                <el-col :span="12">
                  <el-form-item label="资产编号">
                      <el-input v-model="form.asset_no" :placeholder="isEdit ? '可修改，格式：前缀-年月日-2位序号（如 IT-20260826-00）' : '留空自动生成；手填格式 IT-20260826-00'"></el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="资产名称" required>
                    <el-input v-model="form.name" :placeholder="isIT ? '如：核心交换机' : '如：员工工位桌'"></el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="资产子类">
                    <el-select v-model="form.subtype" filterable allow-create default-first-option clearable
                               placeholder="选择或输入子类" style="width:100%">
                      <el-option v-for="s in subtypeOptions" :key="s" :label="s" :value="s"></el-option>
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="12">
                <el-col :span="8"><el-form-item label="品牌"><el-input v-model="form.brand"></el-input></el-form-item></el-col>
                <el-col :span="8"><el-form-item label="型号"><el-input v-model="form.model"></el-input></el-form-item></el-col>
                <el-col :span="8"><el-form-item label="序列号(SN)"><el-input v-model="form.sn"></el-input></el-form-item></el-col>
              </el-row>
              <el-row :gutter="12">
                <el-col :span="12"><el-form-item label="颜色"><el-input v-model="form.color" placeholder="如：黑色"></el-input></el-form-item></el-col>
                <el-col :span="12"><el-form-item label="序列号(SN)"><el-input v-model="form.sn"></el-input></el-form-item></el-col>
              </el-row>
              <el-form-item label="备注"><el-input v-model="form.note" type="textarea" :rows="2"></el-input></el-form-item>
            </div>
            <!-- 其余信息折叠 -->
            <el-collapse v-model="openedSections" class="cmdb-form-collapse">
              <el-collapse-item title="采购与合同信息" name="purchase">
                <el-row :gutter="12">
                  <el-col :span="8"><el-form-item label="合同号"><el-input v-model="form.contract_no" placeholder="HT-2024-001"></el-input></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="供应商"><el-input v-model="form.supplier"></el-input></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="原值(¥)"><el-input v-model="form.price" type="number"></el-input></el-form-item></el-col>
                </el-row>
                <el-row :gutter="12">
                  <el-col :span="12"><el-form-item label="购买日期"><el-date-picker v-model="form.purchase_date" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="保修到期"><el-date-picker v-model="form.warranty_expire" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker></el-form-item></el-col>
                </el-row>
              </el-collapse-item>
              <el-collapse-item title="归属与位置" name="owner">
                <el-row :gutter="12">
                  <el-col :span="8"><el-form-item label="使用人"><el-input v-model="form.user"></el-input></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="部门"><el-input v-model="form.dept"></el-input></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="存放地点"><el-input v-model="form.location"></el-input></el-form-item></el-col>
                </el-row>
                <el-row :gutter="12">
                  <el-col :span="8"><el-form-item label="状态">
                    <el-select v-model="form.status" style="width:100%">
                      <el-option label="使用中" value="使用中"></el-option>
                      <el-option label="在库" value="在库"></el-option>
                      <el-option label="维修中" value="维修中"></el-option>
                      <el-option label="闲置" value="闲置"></el-option>
                      <el-option label="运行中" value="运行中"></el-option>
                      <el-option label="报废" value="报废"></el-option>
                    </el-select>
                  </el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="盘点时间">
                    <el-date-picker v-model="form.inventory_time" type="date" value-format="YYYY-MM-DD" placeholder="未盘点" clearable style="width:100%"></el-date-picker>
                  </el-form-item></el-col>
                </el-row>
                <el-row :gutter="12" v-if="isIT">
                  <el-col :span="12"><el-form-item label="所属机柜">
                    <el-select v-model="form.rack_id" clearable filterable style="width:100%">
                      <el-option v-for="r in rackOptions" :key="r.rack_id" :label="r.rack_id" :value="r.rack_id"></el-option>
                    </el-select>
                  </el-form-item></el-col>
                  <el-col :span="6"><el-form-item label="U位(起)"><el-input v-model="form.u_start" type="number"></el-input></el-form-item></el-col>
                  <el-col :span="6"><el-form-item label="U高"><el-input v-model="form.u_height" type="number"></el-input></el-form-item></el-col>
                </el-row>
              </el-collapse-item>
              <el-collapse-item v-if="isIT" title="系统信息" name="sysinfo">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                  <el-button size="small" @click="addSysInfoRow">添加系统信息</el-button>
                  <span style="font-size:12px;color:#64748b;">IP / 账号 / 登录方式，可添加多条；登录方式选「其他」时可填写自定义方式</span>
                </div>
                <el-table :data="sfApply(systemInfo)" size="small" border style="width:100%;" @sort="sfOnSort" @filter="sfOnFilter">
                  <el-table-column label="IP 地址" min-width="120"><template #header><nc-sf-th label="IP 地址" sort-key="ip" filter-key="ip" prop="ip" :source="sfCandidates(systemInfo, 'ip')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.ip" size="small" placeholder="192.168.1.1"></el-input></template></el-table-column>
                  <el-table-column label="登录方式" min-width="150"><template #header><nc-sf-th label="登录方式" sort-key="login_method" filter-key="login_method" prop="login_method" :source="sfCandidates(systemInfo, 'login_method')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}">
                    <el-select v-model="row.login_method" size="small" style="width:100%">
                      <el-option label="SSH" value="SSH"></el-option>
                      <el-option label="Telnet" value="Telnet"></el-option>
                      <el-option label="Web" value="Web"></el-option>
                      <el-option label="RDP" value="RDP"></el-option>
                      <el-option label="Console" value="Console"></el-option>
                      <el-option label="其他" value="其他"></el-option>
                    </el-select>
                    <el-input v-if="row.login_method==='其他'" v-model="row.custom_method" size="small" placeholder="自定义登录方式" style="margin-top:4px;"></el-input>
                  </template></el-table-column>
                  <el-table-column label="端口" min-width="60"><template #header><nc-sf-th label="端口" sort-key="port" filter-key="port" prop="port" :source="sfCandidates(systemInfo, 'port')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.port" size="small" placeholder="22"></el-input></template></el-table-column>
                  <el-table-column label="账号" min-width="95"><template #header><nc-sf-th label="账号" sort-key="username" filter-key="username" prop="username" :source="sfCandidates(systemInfo, 'username')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.username" size="small"></el-input></template></el-table-column>
                  <el-table-column label="备注" min-width="85"><template #header><nc-sf-th label="备注" sort-key="note" filter-key="note" prop="note" :source="sfCandidates(systemInfo, 'note')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.note" size="small"></el-input></template></el-table-column>
                  <el-table-column label="操作" min-width="60"><template #default="{row,$index}"><el-button size="small" type="danger" text @click="systemInfo.splice($index,1)">删除</el-button></template></el-table-column>
                </el-table>
              </el-collapse-item>
              <el-collapse-item v-if="isIT" title="端口信息" name="ports">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                  <el-button size="small" @click="addPortRow">添加端口</el-button>
                  <el-button size="small" @click="autoGenPorts">自动生成端口</el-button>
                </div>
                <el-table :data="sfApply(ports)" size="small" border style="width:100%;" @sort="sfOnSort" @filter="sfOnFilter">
                  <el-table-column label="端口号" min-width="60"><template #header><nc-sf-th label="端口号" sort-key="port_num" filter-key="port_num" prop="port_num" :source="sfCandidates(ports, 'port_num')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.port_num" size="small"></el-input></template></el-table-column>
                  <el-table-column label="名称" min-width="90"><template #header><nc-sf-th label="名称" sort-key="name" filter-key="name" prop="name" :source="sfCandidates(ports, 'name')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.name" size="small"></el-input></template></el-table-column>
                  <el-table-column label="速率" min-width="70"><template #header><nc-sf-th label="速率" sort-key="speed" filter-key="speed" prop="speed" :source="sfCandidates(ports, 'speed')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.speed" size="small"></el-input></template></el-table-column>
                  <el-table-column label="MAC 地址" min-width="120"><template #header><nc-sf-th label="MAC 地址" sort-key="mac" filter-key="mac" prop="mac" :source="sfCandidates(ports, 'mac')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.mac" size="small" placeholder="AA:BB:CC:DD:EE:FF"></el-input></template></el-table-column>
                  <el-table-column label="IP 地址" min-width="120"><template #header><nc-sf-th label="IP 地址" sort-key="ip" filter-key="ip" prop="ip" :source="sfCandidates(ports, 'ip')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.ip" size="small" placeholder="192.168.1.1"></el-input></template></el-table-column>
                  <el-table-column label="对端设备" min-width="95"><template #header><nc-sf-th label="对端设备" sort-key="remote_device" filter-key="remote_device" prop="remote_device" :source="sfCandidates(ports, 'remote_device')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.remote_device" size="small"></el-input></template></el-table-column>
                  <el-table-column label="对端端口" min-width="80"><template #header><nc-sf-th label="对端端口" sort-key="remote_port" filter-key="remote_port" prop="remote_port" :source="sfCandidates(ports, 'remote_port')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.remote_port" size="small"></el-input></template></el-table-column>
                  <el-table-column label="备注" min-width="70"><template #header><nc-sf-th label="备注" sort-key="note" filter-key="note" prop="note" :source="sfCandidates(ports, 'note')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}"><el-input v-model="row.note" size="small"></el-input></template></el-table-column>
                  <el-table-column label="状态" min-width="105"><template #header><nc-sf-th label="状态" sort-key="status" filter-key="status" prop="status" :source="sfCandidates(ports, 'status')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template><template #default="{row}">
                    <el-select v-model="row.status" size="small" style="width:100%">
                      <el-option label="已连接" value="connected"></el-option>
                      <el-option label="未连接" value="disconnected"></el-option>
                      <el-option label="禁用" value="disabled"></el-option>
                    </el-select>
                  </template></el-table-column>
                  <el-table-column label="操作" min-width="60"><template #default="{row,$index}"><el-button size="small" type="danger" text @click="ports.splice($index,1)">删除</el-button></template></el-table-column>
                </el-table>
              </el-collapse-item>
            </el-collapse>
          </el-form>
          <template #footer>
            <el-button @click="visible=false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="save">保存</el-button>
          </template>
        </el-dialog>`,
        data() {
            return {
                visible: false, isEdit: false, assetId: null, saving: false,
                rackOptions: [],
                categoryOptions: ['IT设备', '办公家具', '生产设备'],
                openedSections: [],
                form: this._blank('IT设备'),
                ports: [],
                systemInfo: [],
                origConfig: {},
            };
        },
        computed: {
            isIT() { return this.form.category === 'IT设备'; },
            subtypeOptions() {
                return (window.CMDB_SUBTYPE_OPTIONS || {})[this.form.category] || [];
            },
        },
        methods: {
            _blank(category) {
                return { name: '', asset_no: '', subtype: '', category: category || 'IT设备', brand: '', model: '', sn: '', color: '', storage: '', memory: '',
                    contract_no: '',
                    supplier: '', price: 0, purchase_date: '', warranty_expire: '',
                    user: '', dept: '', location: '', status: '在库', rack_id: '', u_start: null,
                    u_height: null, note: '', inventory_time: '' };
            },
            /**
             * 打开表单。
             * @param asset 编辑时传 {id}；新建传 null
             * @param opts  { categories: ['IT设备'] 或 ['办公家具','生产设备'], defaultCategory: '办公家具' }
             *              由所在页面传入，限定本页面可添加的资产分类。
             */
            async open(asset, opts) {
                opts = opts || {};
                if (Array.isArray(opts.categories) && opts.categories.length) {
                    this.categoryOptions = opts.categories.slice();
                } else {
                    this.categoryOptions = ['IT设备', '办公家具', '生产设备'];
                }
                this.rackOptions = (await this._racks()).slice();
                this.openedSections = [];
                if (asset && asset.id) {
                    this.isEdit = true; this.assetId = asset.id;
                    const a = await this._load(asset.id);
                    // 编辑时保留原分类（即使不在本页面范围内也要能编辑）
                    if (this.categoryOptions.indexOf(a.category) < 0) this.categoryOptions.push(a.category);
                    const f = this._blank(a.category);
                    Object.assign(f, {
                        name: a.name, asset_no: a.asset_no, subtype: a.subtype || '', category: a.category, brand: a.brand, model: a.model, sn: a.sn,
                        color: a.color || '', storage: a.storage || '', memory: a.memory || '',
                        contract_no: a.contract_no, supplier: a.supplier, price: a.price,
                        purchase_date: a.purchase_date,
                        warranty_expire: a.warranty_expire, user: a.user, dept: a.dept,
                        location: a.location, status: a.status, rack_id: a.rack_id || '',
                        u_start: a.u_start, u_height: a.u_height, note: a.note,
                        inventory_time: a.inventory_time || '',
                    });
                    this.form = f;
                    this.ports = (a.ports || []).map(p => Object.assign({}, p));
                    this.origConfig = Object.assign({}, a.config || {});
                    this.systemInfo = (this.origConfig.system_info || []).map(s => Object.assign({}, s));
                } else {
                    this.isEdit = false; this.assetId = null;
                    const def = opts.defaultCategory && this.categoryOptions.indexOf(opts.defaultCategory) >= 0
                        ? opts.defaultCategory : this.categoryOptions[0];
                    this.form = this._blank(def); this.ports = [];
                    this.systemInfo = []; this.origConfig = {};
                }
                this.visible = true;
            },
            onCategoryChange() {
                // 切换分类后，若原子类不属于新分类的常用项则清空（自定义输入除外，直接清空更直观）
                if (!this.isEdit) this.form.subtype = '';
                if (!this.isIT) { this.form.rack_id = ''; this.form.u_start = null; this.form.u_height = null; this.ports = []; this.systemInfo = []; }
            },
            async _racks() {
                try { const r = await http.get('/api/cmdb/racks'); return r.data.racks || []; }
                catch (e) { return []; }
            },
            async _load(id) {
                const r = await http.get('/api/cmdb/assets/' + id); return r.data;
            },
            addSysInfoRow() {
                this.systemInfo.push({ ip: '', login_method: 'SSH', custom_method: '', port: '', username: '', note: '' });
            },
            addPortRow() {
                const max = this.ports.reduce((mx, p) => Math.max(mx, parseInt(p.port_num) || 0), 0);
                this.ports.push({ port_num: max + 1, name: 'Port' + (max + 1), speed: '', mac: '', ip: '', remote_device: '', remote_port: '', note: '', status: 'disconnected' });
            },
            autoGenPorts() {
                const start = parseInt(prompt('起始端口号', '1') || '1');
                const count = parseInt(prompt('生成数量', '24') || '24');
                const prefix = prompt('端口名称前缀', 'Port') || 'Port';
                if (isNaN(start) || isNaN(count)) return;
                this.ports = [];
                for (let i = 0; i < count; i++) {
                    const num = start + i;
                    this.ports.push({ port_num: num, name: prefix + num, speed: '', remote_device: '', remote_port: '', note: '', status: 'disconnected' });
                }
            },
            async save() {
                if (!this.form.name) { this.$message.error('请输入资产名称'); return; }
                // 资产编号前端预检（后端仍权威校验）：手填时须为 前缀(IT/OF/PE/AS)-8位日期-2位序号
                const ano = (this.form.asset_no || '').trim();
                if (ano) {
                    const m = ano.match(/^(IT|OF|PE|AS)-(\d{8})-(\d{2})$/);
                    if (!m) { this.$message.error('资产编号格式不正确，应为 前缀-年月日-2位序号（如 IT-20260826-00），或留空由系统生成'); return; }
                    const d = new Date(m[2].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
                    if (isNaN(d.getTime()) || m[2] !== d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')) {
                        this.$message.error('资产编号中的日期 ' + m[2] + ' 不是有效日期'); return;
                    }
                }
                const payload = Object.assign({}, this.form);
                payload.price = parseFloat(this.form.price) || 0;
                delete payload.warranty_months; // 保修期(月)已从表单移除，不再提交（保留库内原值）
                payload.u_start = this.form.u_start ? parseInt(this.form.u_start) : null;
                payload.u_height = this.form.u_height ? parseInt(this.form.u_height) : null;
                payload.rack_id = this.form.rack_id || null;
                payload.inventory_time = this.form.inventory_time || null;
                payload.ports = this.ports.filter(p => parseInt(p.port_num) > 0);
                // 系统信息：保留 config 中的其他键，仅覆盖 system_info（空行过滤；自定义登录方式也算有内容）
                const sysInfo = this.systemInfo.filter(s => (s.ip || s.username || s.custom_method || '').toString().trim());
                payload.config = Object.assign({}, this.origConfig, { system_info: sysInfo });
                this.saving = true;
                try {
                    if (this.isEdit) {
                        await http.put('/api/cmdb/assets/' + this.assetId, payload);
                        this.$message.success('资产已更新');
                    } else {
                        const r = await http.post('/api/cmdb/assets', payload);
                        this.$message.success('资产已创建：' + (r.data.asset_no || ''));
                    }
                    this.visible = false;
                    this.$emit('saved');
                } catch (e) {
                    this.$message.error('保存失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                } finally { this.saving = false; }
            },
        },
    }, '资产表单');
})();

/* ---------- 资产详情（只读 + 端口表 + 维保 + 盘点时间 + 操作按钮） ---------- */
(function () {
    window.NC.registerPage('CmdbAssetDetail', {
        mixins: [window.NC.SF_MIXIN],
        template: `
        <el-dialog v-model="visible" :title="'资产详情 - ' + (asset.name||'')" width="900px" top="4vh" destroy-on-close>
          <div v-if="asset">
            <el-row :gutter="16">
              <el-col :span="12">
                <h4 style="margin:0 0 8px;color:#4361ee;">基础信息</h4>
                <el-descriptions :column="1" border size="small">
                  <el-descriptions-item label="资产编号">{{asset.asset_no}}</el-descriptions-item>
                  <el-descriptions-item label="分类">{{asset.category}}</el-descriptions-item>
                  <el-descriptions-item label="子类">{{asset.subtype||'-'}}</el-descriptions-item>
                  <el-descriptions-item label="名称">{{asset.name}}</el-descriptions-item>
                  <el-descriptions-item label="品牌/型号">{{asset.brand||'-'}} {{asset.model||'-'}}</el-descriptions-item>
                  <el-descriptions-item label="序列号(SN)">{{asset.sn||'-'}}</el-descriptions-item>
                  <el-descriptions-item label="颜色">{{asset.color||'-'}}</el-descriptions-item>
                  <el-descriptions-item v-if="asset.category==='IT设备'" label="存储大小">{{asset.storage||'-'}}</el-descriptions-item>
                  <el-descriptions-item v-if="asset.category==='IT设备'" label="内存大小">{{asset.memory||'-'}}</el-descriptions-item>
                  <el-descriptions-item label="使用人/部门">{{asset.user}} / {{asset.dept}}</el-descriptions-item>
                  <el-descriptions-item label="位置">{{asset.rack_id ? asset.rack_id+' '+asset.u_start+'U ('+asset.u_height+'U高)' : (asset.location||'-')}}</el-descriptions-item>
                  <el-descriptions-item label="状态">
                    <el-tag :type="asset.status==='使用中'||asset.status==='运行中'?'success':asset.status==='维修中'?'warning':'info'">{{asset.status}}</el-tag>
                  </el-descriptions-item>
                </el-descriptions>
              </el-col>
              <el-col :span="12">
                <h4 style="margin:0 0 8px;color:#4361ee;">采购与维保</h4>
                <el-descriptions :column="1" border size="small">
                  <el-descriptions-item label="合同号">{{asset.contract_no||'-'}}</el-descriptions-item>
                  <el-descriptions-item label="供应商">{{asset.supplier||'-'}}</el-descriptions-item>
                  <el-descriptions-item label="购买日期">{{asset.purchase_date||'-'}}</el-descriptions-item>
                  <el-descriptions-item label="原值">¥{{asset.price!=null?Number(asset.price).toLocaleString():'-'}}</el-descriptions-item>
                  <el-descriptions-item label="保修到期">{{asset.warranty_expire||'-'}} <el-tag size="small" :type="warrantyType">{{warrantyText}}</el-tag></el-descriptions-item>
                  <el-descriptions-item label="盘点时间">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <el-date-picker v-model="inventoryTime" type="date" value-format="YYYY-MM-DD"
                                      placeholder="未盘点" clearable size="small" style="width:150px"
                                      @change="saveInventoryTime"></el-date-picker>
                      <el-tag size="small" :type="inventoryTime ? 'success' : 'danger'">{{inventoryTime ? '已盘点' : '未盘点'}}</el-tag>
                    </div>
                  </el-descriptions-item>
                </el-descriptions>
              </el-col>
            </el-row>
            <div v-if="systemInfoList.length" style="margin-top:16px;">
              <!-- 系统信息：仅展示 IP/登录方式/端口/账号/备注，不再保存密码 -->
              <h4 style="margin:0 0 8px;color:#4361ee;">系统信息</h4>
              <el-table :data="sfApply(systemInfoList)" size="small" border @sort="sfOnSort" @filter="sfOnFilter">
                <el-table-column prop="ip" label="IP 地址" min-width="130"><template #header><nc-sf-th label="IP 地址" sort-key="ip" filter-key="ip" prop="ip" :source="sfCandidates(systemInfoList, 'ip')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column label="登录方式" width="140"><template #header><nc-sf-th label="登录方式" sort-key="login_method" filter-key="login_method" prop="login_method" :source="sfCandidates(systemInfoList, 'login_method')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template>
                  <template #default="{row}">{{ row.login_method==='其他' && row.custom_method ? '其他(' + row.custom_method + ')' : row.login_method }}</template>
                </el-table-column>
                <el-table-column prop="port" label="端口" width="80"><template #header><nc-sf-th label="端口" sort-key="port" filter-key="port" prop="port" :source="sfCandidates(systemInfoList, 'port')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="username" label="账号" min-width="100"><template #header><nc-sf-th label="账号" sort-key="username" filter-key="username" prop="username" :source="sfCandidates(systemInfoList, 'username')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="note" label="备注" min-width="100"><template #header><nc-sf-th label="备注" sort-key="note" filter-key="note" prop="note" :source="sfCandidates(systemInfoList, 'note')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
              </el-table>
            </div>
            <div v-if="asset.is_network_device && ports.length" style="margin-top:16px;">
              <h4 style="margin:0 0 8px;color:#4361ee;">端口信息</h4>
              <el-table :data="sfApply(ports)" size="small" border @sort="sfOnSort" @filter="sfOnFilter">
                <el-table-column prop="port_num" label="#" width="60"><template #header><nc-sf-th label="#" sort-key="port_num" filter-key="port_num" prop="port_num" :source="sfCandidates(ports, 'port_num')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="name" label="名称" min-width="80"><template #header><nc-sf-th label="名称" sort-key="name" filter-key="name" prop="name" :source="sfCandidates(ports, 'name')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="speed" label="速率" width="80"><template #header><nc-sf-th label="速率" sort-key="speed" filter-key="speed" prop="speed" :source="sfCandidates(ports, 'speed')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="mac" label="MAC 地址" min-width="120"><template #header><nc-sf-th label="MAC 地址" sort-key="mac" filter-key="mac" prop="mac" :source="sfCandidates(ports, 'mac')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="ip" label="IP 地址" min-width="110"><template #header><nc-sf-th label="IP 地址" sort-key="ip" filter-key="ip" prop="ip" :source="sfCandidates(ports, 'ip')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="remote_device" label="对端设备" min-width="90"><template #header><nc-sf-th label="对端设备" sort-key="remote_device" filter-key="remote_device" prop="remote_device" :source="sfCandidates(ports, 'remote_device')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="remote_port" label="对端端口" min-width="80"><template #header><nc-sf-th label="对端端口" sort-key="remote_port" filter-key="remote_port" prop="remote_port" :source="sfCandidates(ports, 'remote_port')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column prop="note" label="备注" min-width="70"><template #header><nc-sf-th label="备注" sort-key="note" filter-key="note" prop="note" :source="sfCandidates(ports, 'note')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
                <el-table-column label="状态" width="100"><template #header><nc-sf-th label="状态" sort-key="status" filter-key="status" prop="status" :source="sfCandidates(ports, 'status')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template>
                  <template #default="{row}"><el-tag size="small" :type="row.status==='connected'?'success':row.status==='disabled'?'info':''">{{row.status==='connected'?'连接':row.status==='disabled'?'禁用':'未连接'}}</el-tag></template>
                </el-table-column>
              </el-table>
            </div>
            <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap; border-top:1px solid #eee; padding-top:12px;">
              <el-button size="small" type="primary" plain @click="doEdit">编辑资产</el-button>
              <el-button v-if="asset.status!=='维修中'" size="small" :loading="busy" @click="doRepair">报修</el-button>
              <el-button size="small" @click="openTransfer">调拨</el-button>
              <el-button size="small" @click="openRenew">续保</el-button>
              <el-button size="small" @click="doPrintLabel">打印标签</el-button>
              <el-button v-if="asset.status!=='报废'" size="small" type="danger" plain :loading="busy" @click="doScrap">报废</el-button>
            </div>
          </div>
          <el-dialog v-model="transferVisible" title="资产调拨" width="440px" append-to-body destroy-on-close>
            <el-form :model="transferForm" label-width="80px" size="default">
              <el-form-item label="使用人"><el-input v-model="transferForm.user"></el-input></el-form-item>
              <el-form-item label="部门"><el-input v-model="transferForm.dept"></el-input></el-form-item>
              <el-form-item label="存放地点"><el-input v-model="transferForm.location"></el-input></el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="transferVisible=false">取消</el-button>
              <el-button type="primary" :loading="busy" @click="doTransfer">确认调拨</el-button>
            </template>
          </el-dialog>
          <el-dialog v-model="renewVisible" title="资产续保" width="440px" append-to-body destroy-on-close>
            <el-form :model="renewForm" label-width="90px" size="default">
              <el-form-item label="新保修到期"><el-date-picker v-model="renewForm.warranty_expire" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker></el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="renewVisible=false">取消</el-button>
              <el-button type="primary" :loading="busy" @click="doRenew">确认续保</el-button>
            </template>
          </el-dialog>
        </el-dialog>`,
        data() { return { visible: false, asset: {}, ports: [], busy: false, inventoryTime: '',
            transferVisible: false, transferForm: { user: '', dept: '', location: '' },
            renewVisible: false, renewForm: { warranty_expire: '' } }; },
        computed: {
            systemInfoList() {
                return (this.asset && this.asset.config && this.asset.config.system_info) || [];
            },
            daysLeft() {
                if (!this.asset.warranty_expire) return null;
                const today = new Date(); today.setHours(0,0,0,0);
                const exp = new Date(this.asset.warranty_expire); exp.setHours(0,0,0,0);
                return Math.round((exp - today) / 86400000);
            },
            warrantyType() {
                const d = this.daysLeft; if (d === null) return 'info';
                return d < 0 ? 'danger' : d <= 30 ? 'warning' : 'success';
            },
            warrantyText() {
                const d = this.daysLeft; if (d === null) return '无维保';
                return d < 0 ? '已过保'+(-d)+'天' : '剩余'+d+'天';
            },
        },
        methods: {
            async open(asset) {
                const r = await http.get('/api/cmdb/assets/' + asset.id);
                this.asset = r.data; this.ports = r.data.ports || [];
                this.inventoryTime = r.data.inventory_time || '';
                this.visible = true;
            },
            async _patch(patch, okMsg) {
                if (!this.asset || !this.asset.id) return false;
                this.busy = true;
                try {
                    await http.put('/api/cmdb/assets/' + this.asset.id, patch);
                    Object.assign(this.asset, patch);
                    this.$message.success(okMsg);
                    this.$emit('changed');
                    return true;
                } catch (e) {
                    this.$message.error('操作失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                    return false;
                } finally { this.busy = false; }
            },
            async saveInventoryTime(val) {
                await this._patch({ inventory_time: val || null }, val ? ('盘点时间已更新：' + val) : '已清除盘点时间');
            },
            doEdit() { this.visible = false; this.$emit('edit', { id: this.asset.id }); },
            doRepair() {
                this.$confirm('将资产「' + this.asset.name + '」标记为「维修中」？', '报修', { type: 'warning' })
                    .then(() => this._patch({ status: '维修中' }, '已报修，状态更新为维修中')).catch(() => {});
            },
            doScrap() {
                this.$confirm('确定将「' + this.asset.name + '」标记为「报废」？（可在编辑中恢复状态）', '报废', { type: 'warning' })
                    .then(() => this._patch({ status: '报废' }, '已标记报废')).catch(() => {});
            },
            openTransfer() {
                this.transferForm = { user: this.asset.user || '', dept: this.asset.dept || '', location: this.asset.location || '' };
                this.transferVisible = true;
            },
            async doTransfer() {
                const ok = await this._patch({ user: this.transferForm.user, dept: this.transferForm.dept, location: this.transferForm.location }, '调拨完成');
                if (ok) this.transferVisible = false;
            },
            openRenew() {
                this.renewForm = { warranty_expire: this.asset.warranty_expire || '' };
                this.renewVisible = true;
            },
            async doRenew() {
                if (!this.renewForm.warranty_expire) { this.$message.warning('请选择新的保修到期日'); return; }
                const ok = await this._patch({ warranty_expire: this.renewForm.warranty_expire }, '续保成功');
                if (ok) this.renewVisible = false;
            },
            doPrintLabel() {
                const a = this.asset;
                const w = window.open('', '_blank', 'width=520,height=380');
                if (!w) { this.$message.error('打印窗口被拦截，请允许本站弹窗后重试'); return; }
                const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                const loc = a.rack_id ? (a.rack_id + ' ' + a.u_start + 'U') : (a.location || '-');
                // 二维码内容：封装资产关键信息，扫码即可查看（纯离线生成，不依赖后端）
                const qrText = [
                    '资产编号: ' + (a.asset_no || '-'),
                    '名称: ' + (a.name || '-'),
                    '分类: ' + (a.category || '-') + ' / ' + (a.subtype || '-'),
                    '品牌型号: ' + ((a.brand || '') + ' ' + (a.model || '')).trim(),
                    'SN: ' + (a.sn || '-'),
                    '使用人: ' + (a.user || '-') + ' (' + (a.dept || '-') + ')',
                    '位置: ' + loc,
                ].join('\n');
                const qrUrl = window.CMDB_QR_DATAURL(qrText, 3);
                const qrHtml = qrUrl ? '<div class="qr"><img src="' + qrUrl + '" alt="QR"><div class="qr-tip">扫码查看资产信息</div></div>' : '';
                w.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>资产标签 ' + esc(a.asset_no) + '</title>' +
                    '<style>body{font-family:-apple-system,\'Segoe UI\',sans-serif;margin:0;padding:16px;}' +
                    '.lbl{border:2px solid #e2e8f0;border-radius:8px;padding:14px 18px;width:440px;display:flex;gap:14px;align-items:flex-start;}' +
                    '.lbl .info{flex:1;min-width:0;}' +
                    '.lbl .no{font-size:20px;font-weight:700;letter-spacing:1px;margin-bottom:6px;}' +
                    '.lbl table{width:100%;font-size:13px;border-collapse:collapse;}' +
                    '.lbl td{padding:2px 4px;vertical-align:top;}.lbl td.k{color:#64748b;width:64px;}' +
                    '.lbl .qr{text-align:center;flex:0 0 auto;}' +
                    '.lbl .qr img{width:110px;height:110px;image-rendering:pixelated;}' +
                    '.lbl .qr-tip{font-size:10px;color:#64748b;margin-top:2px;}' +
                    '</style></head><body onload="window.print()">' +
                    '<div class="lbl"><div class="info">' +
                    '<div class="no">' + esc(a.asset_no) + '</div><table>' +
                    '<tr><td class="k">名称</td><td>' + esc(a.name) + '</td></tr>' +
                    '<tr><td class="k">分类</td><td>' + esc(a.category) + ' / ' + esc(a.subtype || '-') + '</td></tr>' +
                    '<tr><td class="k">使用人</td><td>' + esc(a.user || '-') + ' (' + esc(a.dept || '-') + ')</td></tr>' +
                    '<tr><td class="k">位置</td><td>' + esc(loc) + '</td></tr>' +
                    '<tr><td class="k">SN</td><td>' + esc(a.sn || '-') + '</td></tr>' +
                    '</table></div>' + qrHtml + '</div></body></html>');
                w.document.close();
            },
        },
    }, '资产详情');
})();

/* ---------- 复用页面标题组件（统一各页头部样式） ---------- */
(function () {
    window.NC.registerPage('CmdbPageHeader', {
        props: {
            title: { type: String, default: '' },
            subtitle: { type: String, default: '' },
            icon: { type: String, default: '' },
        },
        template: `
        <div class="cmdb-ph">
          <div class="cmdb-ph-bar"></div>
          <div class="cmdb-ph-main">
            <div class="cmdb-ph-title"><i v-if="icon" class="el-icon">{{icon}}</i> {{title}}</div>
            <div v-if="subtitle" class="cmdb-ph-sub">{{subtitle}}</div>
          </div>
          <div class="cmdb-ph-actions"><slot></slot></div>
        </div>`,
    }, '页面标题');
})();
