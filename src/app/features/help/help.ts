import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-help',
  imports: [MatButtonModule, MatIconModule, MatTabsModule],
  template: `
    <section class="help-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Help & Documentation</p>
          <h1>退休策略规划工具帮助中心</h1>
          <p class="subtitle">
            快速操作指南与完整中文功能手册集中在同一页面。完整手册也可以单独打开并分享。
          </p>
        </div>
        <div class="header-actions">
          <a mat-stroked-button href="/runningsteps_eng.html" target="_blank" rel="noopener noreferrer">
            <mat-icon>open_in_new</mat-icon>
            Open English Guide
          </a>
          <a mat-flat-button href="/docs/readme-zh.html" target="_blank" rel="noopener noreferrer">
            <mat-icon>menu_book</mat-icon>
            分享中文手册
          </a>
        </div>
      </header>

      <mat-tab-group animationDuration="200ms" class="help-tabs">
        <mat-tab label="Quick Help / 快速帮助">
          <div class="tab-content">
            <div class="manual-toolbar">
              <div>
                <h2>快速操作指南</h2>
                <p>适合首次使用时按步骤完成账户、场景、模拟与结果查看。</p>
              </div>
              <a mat-stroked-button href="/runningsteps_eng.html" target="_blank" rel="noopener noreferrer">
                <mat-icon>open_in_new</mat-icon>
                新标签页打开
              </a>
            </div>
            <iframe
              class="manual-frame"
              src="/runningsteps_eng.html"
              title="Retirement Strategy quick help"
              loading="lazy">
            </iframe>
          </div>
        </mat-tab>

        <mat-tab label="完整中文手册">
          <div class="tab-content">
            <div class="manual-toolbar">
              <div>
                <h2>完整中文功能与使用手册</h2>
                <p>
                  详细介绍账户、税务、RMD、Roth Conversion、现金流、Monte Carlo、随机寿命、
                  历史通胀、Guardrail、同 Seed 策略对比和 Production Golden QA。
                </p>
              </div>
              <a mat-stroked-button href="/docs/readme-zh.html" target="_blank" rel="noopener noreferrer">
                <mat-icon>open_in_new</mat-icon>
                新标签页打开或分享
              </a>
            </div>
            <iframe
              class="manual-frame chinese-manual"
              src="/docs/readme-zh.html"
              title="退休策略规划工具完整中文使用手册"
              loading="lazy">
            </iframe>
          </div>
        </mat-tab>

        <mat-tab label="维护与模型边界">
          <div class="tab-content">
            <div class="manual-toolbar">
              <div>
                <h2>v1.0 维护与模型边界</h2>
                <p>用于年度数据刷新、结果解释、专业复核和后续版本维护。</p>
              </div>
            </div>
            <section class="resource-grid">
              <a class="resource-card" href="/docs/DATA_REFRESH.md" target="_blank" rel="noopener noreferrer">
                <mat-icon>update</mat-icon>
                <span><strong>年度数据刷新清单</strong><small>IRS、CMS、SSA、股债与 CPI 更新位置及验收步骤</small></span>
              </a>
              <a class="resource-card" href="/docs/MODEL_ASSUMPTIONS_AND_LIMITATIONS.md" target="_blank" rel="noopener noreferrer">
                <mat-icon>policy</mat-icon>
                <span><strong>模型假设与局限</strong><small>成功率含义、历史抽样、税务简化和未建模事项</small></span>
              </a>
              <a class="resource-card" href="/qa/golden-scenarios" target="_blank" rel="noopener noreferrer">
                <mat-icon>verified</mat-icon>
                <span><strong>Production Golden QA</strong><small>确认线上计算 bundle 与固定基准一致</small></span>
              </a>
              <a class="resource-card" href="/compare-strategies" target="_blank" rel="noopener noreferrer">
                <mat-icon>compare_arrows</mat-icon>
                <span><strong>同 Seed 策略对比</strong><small>在共享市场、通胀和寿命随机流下比较方案</small></span>
              </a>
            </section>
          </div>
        </mat-tab>
      </mat-tab-group>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .help-page {
      max-width: 1500px;
      margin: 0 auto;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 24px;
    }
    .eyebrow {
      margin: 0 0 6px;
      color: #52647a;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #18212f;
      font-size: clamp(1.7rem, 3vw, 2.35rem);
    }
    .subtitle {
      max-width: 800px;
      margin: 10px 0 0;
      color: #52606f;
      line-height: 1.65;
    }
    .header-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }
    .help-tabs {
      overflow: hidden;
      border: 1px solid #d7dde5;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 8px 24px rgba(24, 33, 47, 0.06);
    }
    .tab-content {
      padding: 20px;
    }
    .manual-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 16px;
    }
    .manual-toolbar h2 {
      margin: 0 0 6px;
      color: #18212f;
    }
    .manual-toolbar p {
      max-width: 900px;
      margin: 0;
      color: #59697a;
      line-height: 1.6;
    }
    .manual-frame {
      display: block;
      width: 100%;
      min-height: 72vh;
      border: 1px solid #d7dde5;
      border-radius: 10px;
      background: #fff;
    }
    .chinese-manual {
      min-height: 78vh;
    }
    .resource-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .resource-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 18px;
      border: 1px solid #d7dde5;
      border-radius: 10px;
      color: #263241;
      text-decoration: none;
      background: #fbfdff;
    }
    .resource-card:hover {
      border-color: #87a8cc;
      background: #f2f7fc;
    }
    .resource-card span {
      display: grid;
      gap: 5px;
    }
    .resource-card small {
      color: #59697a;
      line-height: 1.5;
    }
    a mat-icon {
      margin-right: 6px;
    }
    @media (max-width: 900px) {
      .page-header,
      .manual-toolbar {
        flex-direction: column;
      }
      .header-actions {
        justify-content: flex-start;
      }
      .tab-content {
        padding: 14px;
      }
      .manual-frame,
      .chinese-manual {
        min-height: 70vh;
      }
      .resource-grid {
        grid-template-columns: 1fr;
      }
    }
  `
})
export class Help {}
