/* CMDB - IT 机柜视图（机柜卡片 + U 位详情） */
(function () {
    window.NC.registerPage('cmdb_it_racks', {
        mixins: [window.NC.SF_MIXIN],
        template: `
        <div class="cmdb-page">
          <CmdbPageHeader title="IT 机柜视图" subtitle="机柜 U 位总览与设备管理">
            <el-button type="primary" size="small" @click="openRackNew">新建机柜</el-button>
          </CmdbPageHeader>
          <el-row :gutter="16">
            <el-col v-for="rk in racks" :key="rk.rack_id" :span="8" style="margin-bottom:16px;">
              <div class="cmdb-rack-card" @click="openRack(rk)">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <b>{{rk.name || rk.rack_id}}</b>
                  <span>
                    <el-button size="small" text type="primary" @click.stop="openRackEdit(rk)">编辑</el-button>
                    <el-button size="small" text type="danger" @click.stop="deleteRack(rk)">删除</el-button>
                    <el-tag size="small" :type="rk.status==='使用中'?'success':'info'">{{rk.status}}</el-tag>
                  </span>
                </div>
                <div style="color:var(--nc-text-secondary);font-size:12px;margin:4px 0;">{{rk.name}} · {{rk.location}} · {{rk.total_u}}U</div>
                <div>
                  <span v-for="s in rackSlots(rk)" :key="s.u" class="cmdb-mini-slot" :class="s.occupied?'used':'free'" :title="s.u+'U '+(s.occupied?'(已占用)':'(空闲)')"></span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;">
                  <span><b>{{usedU(rk)}}</b>U 已用</span><span><b>{{rk.total_u - usedU(rk)}}</b>U 可用</span><span>使用率 <b>{{usage(rk)}}%</b></span>
                </div>
              </div>
            </el-col>
          </el-row>
          <el-empty v-if="!racks.length" description="暂无机柜数据"></el-empty>
          <CmdbAssetForm ref="formDlg" @saved="refreshAll"/>
          <CmdbAssetDetail ref="detailDlg" @changed="refreshAll" @edit="openEdit"/>
          <el-dialog v-model="rackVisible" :title="'机柜 U 位详情 - '+rackView.rack_id" width="560px">
            <div v-if="rackView.rack_id">
              <el-descriptions :column="2" border size="small" style="margin-bottom:12px;">
                <el-descriptions-item label="机柜">{{rackView.rack_id}}</el-descriptions-item>
                <el-descriptions-item label="名称">{{rackView.name}}</el-descriptions-item>
                <el-descriptions-item label="位置">{{rackView.location}}</el-descriptions-item>
                <el-descriptions-item label="总 U">{{rackView.total_u}}</el-descriptions-item>
              </el-descriptions>
              <div style="margin-bottom:8px;">
                <el-button size="small" type="primary" plain @click="openRackEdit(rackView)">编辑机柜信息</el-button>
                <el-button size="small" type="danger" plain @click="deleteRack(rackView, true)">删除机柜</el-button>
              </div>
              <div style="font-size:12px;color:var(--nc-text-secondary);margin-bottom:6px;">提示：点击已占用 U 位可查看设备；「移出」仅解绑 U 位保留台账，「删除」会彻底删除该资产</div>
              <div v-for="u in rackUList(rackView)" :key="u.u" class="cmdb-rack-unit" :class="u.occupied?'occupied':'empty'"
                   @click="u.occupied && openRackDevice(u)">
                <template v-if="u.occupied">
                  <div class="cmdb-u-main">
                    <span class="cmdb-u-label">{{u.u}}U</span>
                    <b>{{u.device}}</b> ({{u.subtype}}) · {{u.uStart}}U-{{u.uStart+u.height-1}}U · <span style="color:#2b9348;">占用</span>
                  </div>
                  <div class="cmdb-u-actions">
                    <el-button size="small" text type="primary" @click.stop="openRackDeviceDetail(u)">详情</el-button>
                    <el-button size="small" text type="primary" @click.stop="openRackDeviceEdit(u)">编辑</el-button>
                    <el-button size="small" text type="warning" @click.stop="unbindRackDevice(u)">移出</el-button>
                    <el-button size="small" text type="danger" @click.stop="deleteRackDevice(u)">删除</el-button>
                  </div>
                </template>
                <template v-else><span class="cmdb-u-label">{{u.u}}U</span> 空闲</template>
              </div>
            </div>
          </el-dialog>
          <el-dialog v-model="rackFormVisible" :title="rackFormIsEdit ? '编辑机柜' : '新建机柜'" width="520px">
            <el-form :model="rackForm" label-width="90px" size="small">
              <el-form-item label="机柜编号" required>
                <el-input v-model="rackForm.rack_id" placeholder="留空自动生成（ITJG-日期-序号）"></el-input>
              </el-form-item>
              <el-form-item label="名称"><el-input v-model="rackForm.name" placeholder="机柜名称"></el-input></el-form-item>
              <el-form-item label="位置"><el-input v-model="rackForm.location" placeholder="如 机房A区 3排"></el-input></el-form-item>
              <el-form-item label="总U数"><el-input-number v-model="rackForm.total_u" :min="1" :max="60"></el-input-number></el-form-item>
              <el-form-item label="状态">
                <el-select v-model="rackForm.status" style="width:100%;">
                  <el-option label="使用中" value="使用中"></el-option>
                  <el-option label="闲置" value="闲置"></el-option>
                  <el-option label="停用" value="停用"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="备注"><el-input v-model="rackForm.note" type="textarea" :rows="2"></el-input></el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="rackFormVisible=false">取消</el-button>
              <el-button type="primary" :loading="rackSaving" @click="saveRack">保存</el-button>
            </template>
          </el-dialog>
        </div>`,
        data() { return { racks: [], rackVisible: false, rackView: {},
            rackFormVisible: false, rackFormIsEdit: false, rackSaving: false, _editOrigRackId: '',
            rackForm: { rack_id: '', name: '', location: '', total_u: 42, status: '使用中', note: '' } }; },
        methods: {
            async loadRacks() { try { const r = await http.get('/api/cmdb/racks'); this.racks = r.data.racks || []; } catch (e) {} },
            async refreshAll() {
                await this.loadRacks();
                if (this.rackVisible && this.rackView.rack_id) {
                    const rk = this.racks.find(r => r.rack_id === this.rackView.rack_id);
                    if (rk) this.rackView = rk;
                }
            },
            openRackNew() {
                this.rackFormIsEdit = false;
                this.rackForm = { rack_id: '', name: '', location: '', total_u: 42, status: '使用中', note: '' };
                this.rackFormVisible = true;
            },
            openRackEdit(rk) {
                this.rackFormIsEdit = true;
                this._editOrigRackId = rk.rack_id;
                this.rackForm = { rack_id: rk.rack_id, name: rk.name || '', location: rk.location || '',
                    total_u: rk.total_u || 42, status: rk.status || '使用中', note: rk.note || '' };
                this.rackFormVisible = true;
            },
            async saveRack() {
                // 自动生成机柜编号：留空时按 ITJG-YYYYMMDD-XX 规则生成
                if (!this.rackForm.rack_id || !this.rackForm.rack_id.trim()) {
                    const today = new Date();
                    const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
                    const prefix = 'ITJG-' + dateStr + '-';
                    const existing = this.racks.filter(rk => rk.rack_id && rk.rack_id.startsWith(prefix));
                    let maxSeq = -1;
                    for (const rk of existing) {
                        const seqStr = rk.rack_id.substring(prefix.length);
                        const seq = parseInt(seqStr, 10);
                        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                    }
                    this.rackForm.rack_id = prefix + String(maxSeq + 1).padStart(2, '0');
                }
                if (!this.rackForm.rack_id) { this.$message.warning('请填写机柜编号'); return; }
                this.rackSaving = true;
                try {
                    if (this.rackFormIsEdit) {
                        await http.put('/api/cmdb/racks/' + encodeURIComponent(this._editOrigRackId || this.rackForm.rack_id), {
                            rack_id: this.rackForm.rack_id,
                            name: this.rackForm.name, location: this.rackForm.location,
                            total_u: this.rackForm.total_u, status: this.rackForm.status, note: this.rackForm.note });
                        this.$message.success('机柜已更新');
                    } else {
                        await http.post('/api/cmdb/racks', this.rackForm);
                        this.$message.success('机柜已创建');
                    }
                    this.rackFormVisible = false;
                    this.refreshAll();
                } catch (e) { this.$message.error('保存失败：' + (e.response && e.response.data && e.response.data.detail || e.message)); }
                finally { this.rackSaving = false; }
            },
            usedU(rk) { return (rk.devices || []).reduce((s, d) => s + (parseInt(d.u_height) || 0), 0); },
            usage(rk) { const t = rk.total_u || 1; return Math.round(this.usedU(rk) / t * 100); },
            rackSlots(rk) {
                const slots = []; const total = rk.total_u || 0;
                for (let u = total; u >= 1; u--) {
                    const occ = (rk.devices || []).find(d => u >= (parseInt(d.u_start) || 0) && u < (parseInt(d.u_start) || 0) + (parseInt(d.u_height) || 1));
                    slots.push({ u: u, occupied: !!occ, device: occ ? occ.name : '' });
                }
                return slots;
            },
            openRack(rk) { this.rackView = rk; this.rackVisible = true; },
            rackUList(rk) {
                const list = [];
                const total = rk.total_u || 0;
                for (let u = total; u >= 1; u--) {
                    const occ = (rk.devices || []).find(d => u >= (parseInt(d.u_start) || 0) && u < (parseInt(d.u_start) || 0) + (parseInt(d.u_height) || 1));
                    list.push({ u: u, occupied: !!occ, id: occ ? occ.id : null, device: occ ? occ.name : '', subtype: occ ? occ.subtype : '', uStart: occ ? parseInt(occ.u_start) : 0, height: occ ? parseInt(occ.u_height) : 1 });
                }
                return list;
            },
            openRackDevice(u) { if (u && u.id) this.openRackDeviceDetail(u); },
            openRackDeviceDetail(u) { if (u && u.id) this.$refs.detailDlg.open({ id: u.id }); },
            openRackDeviceEdit(u) { if (u && u.id) this.$refs.formDlg.open({ id: u.id }, { categories: ['IT设备'] }); },
            openEdit(row) { this.$refs.formDlg.open(row, { categories: ['IT设备'] }); },
            async deleteRack(rk, fromDialog) {
                if (!rk || !rk.rack_id) return;
                const url = '/api/cmdb/racks/' + encodeURIComponent(rk.rack_id);
                try {
                    await this.$confirm('确定删除机柜 ' + rk.rack_id + ' ？', '删除机柜', {
                        type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
                } catch (e) { return; }
                try {
                    await http.delete(url);
                    this.$message.success('机柜已删除');
                    if (fromDialog) this.rackVisible = false;
                    this.refreshAll();
                    return;
                } catch (e) {
                    const data = (e.response && e.response.data) || {};
                    if (e.response && e.response.status === 400 && data.devices) {
                        try {
                            await this.$confirm(
                                '机柜 ' + rk.rack_id + ' 内还有 ' + data.devices + ' 台已上架设备。' +
                                '继续删除会把这些设备移出机柜（仅解绑 U 位，资产台账保留）。是否继续？',
                                '机柜内有设备', { type: 'warning', confirmButtonText: '解绑并删除', cancelButtonText: '取消' });
                        } catch (e2) { return; }
                        try {
                            const r = await http.delete(url + '?force=1');
                            const n = (r.data && r.data.unbound) || 0;
                            this.$message.success('机柜已删除，' + n + ' 台设备已移出机柜（台账保留）');
                            if (fromDialog) this.rackVisible = false;
                            this.refreshAll();
                        } catch (e3) {
                            this.$message.error('删除失败：' + ((e3.response && e3.response.data && e3.response.data.detail) || e3.message));
                        }
                        return;
                    }
                    this.$message.error('删除失败：' + (data.detail || e.message));
                }
            },
            unbindRackDevice(u) {
                if (!u || !u.id) return;
                this.$confirm('将设备「' + (u.device || u.id) + '」移出机柜？仅解绑 U 位，资产台账保留。', '移出机柜', {
                    type: 'warning', confirmButtonText: '移出', cancelButtonText: '取消' }).then(async () => {
                    try {
                        await http.post('/api/cmdb/assets/' + u.id + '/unbind-rack');
                        this.$message.success('已移出机柜');
                        this.refreshAll();
                    } catch (e) {
                        this.$message.error('移出失败：' + ((e.response && e.response.data && e.response.data.detail) || e.message));
                    }
                }).catch(() => {});
            },
            deleteRackDevice(u) {
                if (!u || !u.id) return;
                this.$confirm('确定彻底删除资产「' + (u.device || u.id) + '」？该操作不可恢复，若只想下架请用「移出」。', '删除资产', {
                    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }).then(async () => {
                    try {
                        await http.delete('/api/cmdb/assets/' + u.id);
                        this.$message.success('资产已删除');
                        this.refreshAll();
                    } catch (e) {
                        this.$message.error('删除失败：' + ((e.response && e.response.data && e.response.data.detail) || e.message));
                    }
                }).catch(() => {});
            },
        },
        mounted() { this.loadRacks(); },
    }, 'IT 机柜视图', '/cmdb/it-racks');
})();
