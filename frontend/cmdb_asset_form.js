/* CMDB - 资产新建/编辑表单（含端口编辑） */
(function () {
    if (window.NC && window.NC.jsVersions) {
        window.NC.jsVersions['CmdbAssetForm'] = "";
    }
    window.NC.registerPage('CmdbAssetForm', {
        mixins: [window.NC.SF_MIXIN],
        template: `
        <style>
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
            <div class="nc-form-card">
              <div class="nc-section-title">常用信息</div>
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
              </el-row>
              <el-form-item label="备注"><el-input v-model="form.note" type="textarea" :rows="2"></el-input></el-form-item>
            </div>
            <div class="nc-section">
              <div class="nc-section-title">采购与合同信息</div>
              <div class="nc-form-card">
                <el-row :gutter="12">
                  <el-col :span="8"><el-form-item label="合同号"><el-input v-model="form.contract_no" placeholder="HT-2024-001"></el-input></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="供应商"><el-input v-model="form.supplier"></el-input></el-form-item></el-col>
                  <el-col :span="8"><el-form-item label="原值(¥)"><el-input v-model="form.price" type="number"></el-input></el-form-item></el-col>
                </el-row>
                <el-row :gutter="12">
                  <el-col :span="12"><el-form-item label="购买日期"><el-date-picker v-model="form.purchase_date" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker></el-form-item></el-col>
                  <el-col :span="12"><el-form-item label="保修到期"><el-date-picker v-model="form.warranty_expire" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker></el-form-item></el-col>
                </el-row>
              </div>
            </div>
            <div class="nc-section">
              <div class="nc-section-title">归属与位置</div>
              <div class="nc-form-card">
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
              </div>
            </div>
            <div class="nc-section" v-if="isIT">
              <div class="nc-section-title">系统信息</div>
              <div class="nc-form-card">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                  <el-button size="small" @click="addSysInfoRow">添加系统信息</el-button>
                  <span class="nc-form-hint">IP / 账号 / 登录方式，可添加多条</span>
                </div>
                <el-table :data="sfApply(systemInfo)" size="small" border style="width:100%;">
                  <el-table-column label="IP 地址" min-width="120"><template #default="{row}"><el-input v-model="row.ip" size="small" placeholder="192.168.1.1"></el-input></template></el-table-column>
                  <el-table-column label="登录方式" min-width="150"><template #default="{row}">
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
                  <el-table-column label="端口" min-width="60"><template #default="{row}"><el-input v-model="row.port" size="small" placeholder="22"></el-input></template></el-table-column>
                  <el-table-column label="账号" min-width="95"><template #default="{row}"><el-input v-model="row.username" size="small"></el-input></template></el-table-column>
                  <el-table-column label="备注" min-width="85"><template #default="{row}"><el-input v-model="row.note" size="small"></el-input></template></el-table-column>
                  <el-table-column label="操作" min-width="60"><template #default="{row,$index}"><el-button size="small" type="danger" text @click="systemInfo.splice($index,1)">删除</el-button></template></el-table-column>
                </el-table>
              </div>
            </div>
            <div class="nc-section" v-if="isIT">
              <div class="nc-section-title">端口信息</div>
              <div class="nc-form-card">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                  <el-button size="small" @click="addPortRow">添加端口</el-button>
                  <el-button size="small" @click="autoGenPorts">自动生成端口</el-button>
                </div>
                <el-table :data="sfApply(ports)" size="small" border style="width:100%;">
                  <el-table-column label="端口号" min-width="60"><template #default="{row}"><el-input v-model="row.port_num" size="small"></el-input></template></el-table-column>
                  <el-table-column label="名称" min-width="90"><template #default="{row}"><el-input v-model="row.name" size="small"></el-input></template></el-table-column>
                  <el-table-column label="速率" min-width="70"><template #default="{row}"><el-input v-model="row.speed" size="small"></el-input></template></el-table-column>
                  <el-table-column label="MAC 地址" min-width="120"><template #default="{row}"><el-input v-model="row.mac" size="small" placeholder="AA:BB:CC:DD:EE:FF"></el-input></template></el-table-column>
                  <el-table-column label="IP 地址" min-width="120"><template #default="{row}"><el-input v-model="row.ip" size="small" placeholder="192.168.1.1"></el-input></template></el-table-column>
                  <el-table-column label="对端设备" min-width="140"><template #default="{row}">
                    <el-select v-model="row.remote_device_id" size="small" filterable clearable placeholder="选择IT资产" style="width:100%"
                               @change="onRemoteDeviceChange(row, $event)">
                      <el-option v-for="a in assetListOptions" :key="a.id" :label="a.name + ' (' + a.asset_no + ')'" :value="a.id"></el-option>
                    </el-select>
                    <el-input v-if="!row.remote_device_id" v-model="row.remote_device" size="small" placeholder="或手动输入设备名" style="margin-top:4px;"></el-input>
                  </template></el-table-column>
                  <el-table-column label="对端端口名称" min-width="140"><template #default="{row}">
                    <el-input v-model="row.remote_port" size="small" placeholder="输入端口名称（自定义或匹配已有）"></el-input>
                    <el-select v-if="row.remote_device_id && row.remote_ports.length" v-model="row.remote_port" size="small" filterable clearable
                               placeholder="或从对端设备已有端口选择" style="width:100%;margin-top:4px;"
                               @change="onRemotePortChange(row, $event)">
                      <el-option v-for="p in row.remote_ports" :key="p.port_num" :label="p.name || ('#' + p.port_num)" :value="p.name || ('#' + p.port_num)"></el-option>
                    </el-select>
                  </template></el-table-column>
                  <el-table-column label="备注" min-width="70"><template #default="{row}"><el-input v-model="row.note" size="small"></el-input></template></el-table-column>
                  <el-table-column label="状态" min-width="105"><template #default="{row}">
                    <el-select v-model="row.status" size="small" style="width:100%">
                      <el-option label="已连接" value="connected"></el-option>
                      <el-option label="未连接" value="disconnected"></el-option>
                      <el-option label="禁用" value="disabled"></el-option>
                    </el-select>
                  </template></el-table-column>
                  <el-table-column label="操作" min-width="60"><template #default="{row,$index}"><el-button size="small" type="danger" text @click="ports.splice($index,1)">删除</el-button></template></el-table-column>
                </el-table>
              </div>
            </div>
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
                assetListOptions: [],
                categoryOptions: ['IT设备', '办公家具', '生产设备'],
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
            async open(asset, opts) {
                opts = opts || {};
                if (Array.isArray(opts.categories) && opts.categories.length) {
                    this.categoryOptions = opts.categories.slice();
                } else {
                    this.categoryOptions = ['IT设备', '办公家具', '生产设备'];
                }
                this.rackOptions = (await this._racks()).slice();
                if (this.isIT) {
                    const all = (await this._allAssets()).slice();
                    this.assetListOptions = all.filter(a => a.category === 'IT设备');
                } else {
                    this.assetListOptions = [];
                }
                if (asset && asset.id) {
                    this.isEdit = true; this.assetId = asset.id;
                    const a = await this._load(asset.id);
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
                    this.ports = (a.ports || []).map(p => Object.assign({}, p, {
                        remote_device_id: p.remote_asset_id || null,
                        remote_ports: [],
                        _orig_remote_device_id: p.remote_asset_id || null,
                        _orig_remote_port: p.remote_port || '',
                    }));
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
                if (!this.isEdit) this.form.subtype = '';
                if (!this.isIT) { this.form.rack_id = ''; this.form.u_start = null; this.form.u_height = null; this.ports = []; this.systemInfo = []; this.assetListOptions = []; }
                else { this._allAssets().then(list => { this.assetListOptions = list.filter(a => a.category === 'IT设备'); }); }
            },
            async _racks() {
                try { const r = await http.get('/api/cmdb/racks'); return r.data.racks || []; }
                catch (e) { return []; }
            },
            async _allAssets() {
                try {
                    const PAGE_SIZE = 200, MAX_ROWS = 10000;
                    const first = await http.get('/api/cmdb/assets', { params: { page: 1, size: PAGE_SIZE } });
                    const rows = first.data.assets || [];
                    const pages = Math.ceil(Math.min(first.data.total || 0, MAX_ROWS) / PAGE_SIZE);
                    if (pages > 1) {
                        const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) =>
                            http.get('/api/cmdb/assets', { params: { page: i + 2, size: PAGE_SIZE } })));
                        rest.forEach(r => { rows.push.apply(rows, r.data.assets || []); });
                    }
                    return rows;
                } catch (e) { return []; }
            },
            async _load(id) {
                const r = await http.get('/api/cmdb/assets/' + id); return r.data;
            },
            async onRemoteDeviceChange(row, assetId) {
                row.remote_ports = [];
                row.remote_port = '';
                row.status = 'disconnected';
                if (!assetId) { row.remote_device = ''; return; }
                const asset = this.assetListOptions.find(a => a.id === assetId);
                if (asset) {
                    row.remote_device = asset.name;
                    try {
                        const r = await http.get('/api/cmdb/assets/' + assetId + '/ports');
                        row.remote_ports = r.data.ports || [];
                    } catch (e) { row.remote_ports = []; }
                }
            },
            onRemotePortChange(row, portName) {
                if (!portName || !row.remote_ports.length) return;
                const port = row.remote_ports.find(p => (p.name || ('#' + p.port_num)) === portName);
                if (port) {
                    row.status = port.status || 'connected';
                }
            },
            addSysInfoRow() {
                this.systemInfo.push({ ip: '', login_method: 'SSH', custom_method: '', port: '', username: '', note: '' });
            },
            addPortRow() {
                const max = this.ports.reduce((mx, p) => Math.max(mx, parseInt(p.port_num) || 0), 0);
                this.ports.push({ port_num: max + 1, name: 'Port' + (max + 1), speed: '', mac: '', ip: '', remote_device: '', remote_device_id: null, remote_port: '', remote_ports: [], note: '', status: 'disconnected' });
            },
            autoGenPorts() {
                const start = parseInt(prompt('起始端口号', '1') || '1');
                const count = parseInt(prompt('生成数量', '24') || '24');
                const prefix = prompt('端口名称前缀', 'Port') || 'Port';
                if (isNaN(start) || isNaN(count)) return;
                this.ports = [];
                for (let i = 0; i < count; i++) {
                    const num = start + i;
                    this.ports.push({ port_num: num, name: prefix + num, speed: '', remote_device: '', remote_device_id: null, remote_port: '', remote_ports: [], note: '', status: 'disconnected' });
                }
            },
            async save() {
                if (!this.form.name) { this.$message.error('请输入资产名称'); return; }
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
                delete payload.warranty_months;
                payload.u_start = this.form.u_start ? parseInt(this.form.u_start) : null;
                payload.u_height = this.form.u_height ? parseInt(this.form.u_height) : null;
                payload.rack_id = this.form.rack_id || null;
                payload.inventory_time = this.form.inventory_time || null;
                const portsData = this.ports.filter(p => parseInt(p.port_num) > 0).map(p => {
                    const port = { port_num: p.port_num, name: p.name, speed: p.speed, mac: p.mac, ip: p.ip, remote_device: p.remote_device, remote_port: p.remote_port, note: p.note, status: p.status };
                    if (p.remote_device_id) port.remote_device_id = p.remote_device_id;
                    return port;
                });
                payload.ports = portsData;
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
                    // 保存成功后自动同步对端端口（区分自定义/下拉选择）
                    if (this.isIT) {
                        const localId = this.assetId || (this.form && this.form.id);
                        // 清理旧关联：原有关联被清空或变更时，清空旧对端设备上的关联
                        for (const p of this.ports) {
                            const origDev = p._orig_remote_device_id;
                            const origPort = p._orig_remote_port;
                            const curDev = p.remote_device_id;
                            const curPort = p.remote_port || '';
                            if (origDev && origPort && (!curDev || curDev !== origDev || curPort !== origPort)) {
                                try {
                                    await http.post('/api/cmdb/ports/sync-remote', {
                                        local_asset_id: localId,
                                        local_port_num: p.port_num,
                                        remote_asset_id: origDev,
                                        remote_port_name: origPort,
                                    });
                                } catch (_) {}
                            }
                        }
                        // 建立新关联
                        const syncPorts = this.ports.filter(p => p.remote_device_id && p.remote_port);
                        for (const sp of syncPorts) {
                            // 判断是自定义输入还是下拉选择：检查值是否在 remote_ports 列表中
                            const isExisting = sp.remote_ports.some(rp => (rp.name || ('#' + rp.port_num)) === sp.remote_port);
                            const payload_sync = {
                                local_asset_id: localId,
                                local_port_num: sp.port_num,
                                remote_asset_id: sp.remote_device_id,
                                remote_port_name: sp.remote_port,
                            };
                            if (!isExisting) {
                                // 场景一：自定义输入，传 custom_port_name 让后端自动创建
                                payload_sync.custom_port_name = sp.remote_port;
                            }
                            try {
                                const sr = await http.post('/api/cmdb/ports/sync-remote', payload_sync);
                                if (sr.data.action === 'conflict') {
                                    const det = sr.data.detail || {};
                                    try {
                                        await this.$confirm(
                                            '对端端口「' + sp.remote_port + '」已连接到 ' + (det.remote_device || '其他设备') +
                                            ' 的 ' + (det.remote_port || '-') + '，是否覆盖为本端连接？',
                                            '对端端口冲突', { type: 'warning', confirmButtonText: '覆盖', cancelButtonText: '取消' });
                                        await http.post('/api/cmdb/ports/sync-remote', Object.assign({}, payload_sync, { force: true }));
                                    } catch (_) {}
                                }
                            } catch (_) {}
                        }
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
