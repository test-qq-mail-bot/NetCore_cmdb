/* CMDB - 报表中心 */
(function () {
    window.NC.registerPage('cmdb_reports', {
        template: `
        <div class="cmdb-page">
          <CmdbPageHeader title="报表中心" subtitle="报表导出与数据备份恢复"></CmdbPageHeader>
          <el-row :gutter="16">
            <el-col v-for="r in reports" :key="r.type" :span="8" style="margin-bottom:16px;">
              <el-card class="cmdb-report-card">
                <div style="font-weight:600;margin-bottom:6px;">{{r.title}}</div>
                <div style="color:var(--nc-text-secondary);font-size:12px;margin-bottom:12px;">{{r.desc}}</div>
                <div style="display:flex;gap:8px;">
                  <el-button size="small" type="primary" :loading="r.loadingHtml" @click="download(r.type,'html')">HTML</el-button>
                  <el-button size="small" type="success" :loading="r.loadingCsv" @click="download(r.type,'csv')">CSV</el-button>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <div class="cmdb-section-title" style="margin-top:24px;">数据备份与恢复</div>
          <el-card>
            <el-row :gutter="16">
              <el-col :span="12">
                <div style="font-weight:600;margin-bottom:6px;">全量备份导出</div>
                <div style="color:var(--nc-text-secondary);font-size:12px;margin-bottom:12px;">导出全部设备、机柜与端口连接为 JSON 文件，用于备份配置，可随时完整还原。</div>
                <el-button type="primary" :loading="exporting" @click="backupExport">导出备份 (JSON)</el-button>
              </el-col>
              <el-col :span="12">
                <div style="font-weight:600;margin-bottom:6px;">备份导入恢复</div>
                <div style="color:var(--nc-text-secondary);font-size:12px;margin-bottom:12px;">选择之前导出的 JSON 备份文件恢复数据。</div>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                  <el-radio-group v-model="importMode" size="small">
                    <el-radio-button label="merge">合并更新</el-radio-button>
                    <el-radio-button label="overwrite">覆盖还原</el-radio-button>
                  </el-radio-group>
                  <el-upload :auto-upload="false" :on-change="onBackupFile" :show-file-list="false" accept=".json" style="display:inline-block;">
                    <el-button size="small">选择文件</el-button>
                  </el-upload>
                  <span style="font-size:12px;color:var(--nc-text-secondary);">{{ backupFileName || '未选择文件' }}</span>
                  <el-button type="warning" size="small" :loading="importing" :disabled="!backupContent" @click="backupImport">开始导入</el-button>
                </div>
                <div style="font-size:12px;color:#e6a23c;margin-top:8px;">
                  合并更新：按资产编号/SN 匹配，存在则更新、不存在则新增（安全，不丢数据）；覆盖还原：清空现有数据后整表还原（用于灾难恢复）。
                </div>
              </el-col>
            </el-row>
          </el-card>
        </div>`,
        data() {
            return {
                reports: [
                    { type: 'inventory', title: '资产盘点报表', desc: '全部资产台账（编号/分类/使用人/原值/保修）', loadingHtml: false, loadingCsv: false },
                    { type: 'dept', title: '部门资产汇总表', desc: '按部门统计资产数量与原值合计', loadingHtml: false, loadingCsv: false },
                    { type: 'warranty', title: '维保到期预警报表', desc: '即将到期与正常维保资产清单', loadingHtml: false, loadingCsv: false },
                ],
                exporting: false,
                importing: false,
                importMode: 'merge',
                backupContent: '',
                backupFileName: '',
            };
        },
        methods: {
            async backupExport() {
                this.exporting = true;
                try {
                    const r = await http.get('/api/cmdb/backup/export', { responseType: 'blob' });
                    const cd = (r.headers && (r.headers['content-disposition'] || r.headers['Content-Disposition'])) || '';
                    const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="?([^";]+)"?/);
                    const fname = m ? decodeURIComponent(m[1]) : 'cmdb_backup.json';
                    const url = URL.createObjectURL(r.data);
                    const a = document.createElement('a'); a.href = url; a.download = fname;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                    this.$message.success('已导出备份 ' + fname);
                } catch (e) {
                    this.$message.error('导出失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                } finally { this.exporting = false; }
            },
            onBackupFile(file) {
                const _name = (file.name || (file.raw && file.raw.name) || '').toLowerCase();
                if (!_name.endsWith('.json')) { this.$message.error('仅支持 JSON 备份文件'); return; }
                const raw = file.raw || file;
                this.backupFileName = file.name || (raw && raw.name) || '';
                const reader = new FileReader();
                reader.onload = () => { this.backupContent = reader.result; };
                reader.onerror = () => { this.$message.error('读取文件失败'); };
                reader.readAsText(raw);
            },
            async backupImport() {
                if (!this.backupContent) { this.$message.warning('请先选择备份文件'); return; }
                if (this.importMode === 'overwrite') {
                    try {
                        await this.$confirm('覆盖还原会清空当前所有设备与机柜数据后再导入，确认继续？', '危险操作确认', {
                            type: 'warning', confirmButtonText: '确认覆盖', cancelButtonText: '取消',
                        });
                    } catch (e) { return; }
                }
                this.importing = true;
                try {
                    const r = await http.post('/api/cmdb/backup/import', { content: this.backupContent, mode: this.importMode });
                    const d = r.data || {};
                    if (d.success === false) {
                        this.$message.error('导入失败：' + (d.message || '未知错误'));
                    } else {
                        this.$message.success('导入完成：新增 ' + (d.added || 0) + '，更新 ' + (d.updated || 0) +
                            '，跳过 ' + (d.skipped || 0) + '，机柜 +' + (d.racks_added || 0) + '/' + (d.racks_updated || 0) +
                            (d.errors && d.errors.length ? ('，错误 ' + d.errors.length + ' 条') : ''));
                        this.backupContent = ''; this.backupFileName = '';
                    }
                } catch (e) {
                    this.$message.error('导入失败：' + (e.response && e.response.data && (e.response.data.message || e.response.data.detail) || e.message));
                } finally { this.importing = false; }
            },
            async download(type, format) {
                const item = this.reports.find(r => r.type === type);
                const key = format === 'csv' ? 'loadingCsv' : 'loadingHtml';
                item[key] = true;
                try {
                    const r = await http.get('/api/cmdb/reports/export?type=' + type + '&format=' + format, { responseType: 'blob' });
                    const blob = r.data;
                    const cd = (r.headers && (r.headers['content-disposition'] || r.headers['Content-Disposition'])) || '';
                    const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="?([^";]+)"?/);
                    const fname = m ? decodeURIComponent(m[1]) : ('cmdb_' + type + '.' + format);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = fname;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                    this.$message.success('已导出 ' + fname);
                } catch (e) {
                    this.$message.error('导出失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                } finally { item[key] = false; }
            },
        },
    }, '报表中心');
})();
