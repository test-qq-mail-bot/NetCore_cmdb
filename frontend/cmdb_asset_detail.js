/* CMDB - 资产详情（只读 + 端口表 + 维保 + 盘点时间 + 操作按钮） */
(function () {
    if (window.NC && window.NC.jsVersions) {
        window.NC.jsVersions['CmdbAssetDetail'] = "";
    }
    window.NC.registerPage('CmdbAssetDetail', {
        mixins: [window.NC.SF_MIXIN],
        template: `
        <el-dialog v-model="visible" :title="'资产详情 - ' + (asset.name||'')" width="900px" top="4vh" destroy-on-close>
          <div v-if="asset">
            <el-row :gutter="16">
              <el-col :span="12">
                <div class="nc-section-title">基础信息</div>
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
                <div class="nc-section-title">采购与维保</div>
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
              <div class="nc-section-title">系统信息</div>
              <el-table :data="sfApply(systemInfoList)" size="small" border>
                <el-table-column prop="ip" label="IP 地址" min-width="130"></el-table-column>
                <el-table-column label="登录方式" width="140">
                  <template #default="{row}">{{ row.login_method==='其他' && row.custom_method ? '其他(' + row.custom_method + ')' : row.login_method }}</template>
                </el-table-column>
                <el-table-column prop="port" label="端口" width="80"></el-table-column>
                <el-table-column prop="username" label="账号" min-width="100"></el-table-column>
                <el-table-column prop="note" label="备注" min-width="100"></el-table-column>
              </el-table>
            </div>
            <div v-if="asset.is_network_device && ports.length" style="margin-top:16px;">
              <div class="nc-section-title">端口信息</div>
              <el-table :data="sfApply(ports)" size="small" border>
                <el-table-column prop="port_num" label="#" width="60"></el-table-column>
                <el-table-column prop="name" label="名称" min-width="80"></el-table-column>
                <el-table-column prop="speed" label="速率" width="80"></el-table-column>
                <el-table-column prop="mac" label="MAC 地址" min-width="120"></el-table-column>
                <el-table-column prop="ip" label="IP 地址" min-width="110"></el-table-column>
                <el-table-column prop="remote_device" label="对端设备" min-width="90"></el-table-column>
                <el-table-column prop="remote_port" label="对端端口" min-width="80"></el-table-column>
                <el-table-column prop="note" label="备注" min-width="70"></el-table-column>
                <el-table-column label="状态" width="100">
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
