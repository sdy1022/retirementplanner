# Retirement Strategy Calculator

A client-side personal finance tool built with Angular and Supabase that models retirement drawdown strategies â€” Roth conversions, Required Minimum Distributions (RMDs), Social Security timing, and Buy-Borrow-Die â€” over a full lifetime projection, then stress-tests the winning plan with Monte Carlo simulation.

## ðŸŽ¯ What It Does

This tool replaces ad-hoc spreadsheet analysis with a repeatable, testable model that lets you:

- **Snapshot your accounts** â€” 401(k), Traditional IRA, Roth IRA, and taxable brokerage.
- **Compare strategies side by side** â€” a "do nothing" baseline vs. Roth conversion strategies (fixed amount, fill-to-bracket, auto-optimize, smooth income target).
- **Pick the right lever per bucket** â€” the strategy selector decides whether Roth conversion (pre-tax dollars) and/or Buy-Borrow-Die (brokerage dollars) add value, since the two act on disjoint money.
- **Get a concrete action plan** â€” the dashboard translates the winning tax-funding strategy into year-by-year steps.
- **Quantify the risk** â€” a Monte Carlo page runs the chosen plan through thousands of randomized market-return sequences (historical block bootstrap) and reports the probability the plan never runs short, plus a percentile fan chart of assets by age.

## ðŸ“± Pages

| Route | Purpose |
|---|---|
| `/dashboard` | Strategy comparison, winning-strategy charts, and the year-by-year action plan |
| `/accounts` | Enter and manage retirement account snapshots |
| `/scenarios` | Build scenarios: ages, spending, return assumptions, conversion strategy |
| `/monte-carlo` | Success probability, ending-asset percentiles, and the fan chart |
| `/login` | Supabase-backed sign in (optional â€” the app works without it) |

## ðŸš€ Tech Stack

- **Frontend**: Angular 20 (standalone components, signals, no NgModules)
- **UI**: Angular Material + ngx-charts for visualization
- **Persistence (optional)**: Supabase (PostgreSQL + Auth) for saving scenarios and accounts
- **Hosting target**: Vercel (SPA mode)
- **Computation**: pure, framework-free TypeScript â€” the entire engine runs in the browser with no server round-trips

## ðŸ§® Calculation Engine

The core logic lives in `src/app/core/calculators/` as pure, immutable, unit-tested functions:

| Module | Responsibility |
|---|---|
| `tax-tables.ts` | Federal tax brackets and standard deductions (2026, single), with bracket-inflation handling |
| `tax-bracket-calculator.ts` | Progressive tax math: marginal rates, bracket-fill headroom, rate ceilings |
| `rmd-calculator.ts` | IRS Uniform Lifetime Table divisors; SECURE 2.0 start age (73 or 75 by birth year) |
| `roth-conversion-calculator.ts` | Year-by-year simulation loop: RMDs, Social Security, conversions, taxes, growth |
| `scenario-engine.ts` | Entry point that runs a scenario; for `auto-optimize` it searches across bracket ceilings |
| `strategy-selector.ts` | Decides Roth conversion vs. Buy-Borrow-Die per asset bucket by simulating both funding paths |
| `action-plan.ts` | Turns the winning strategy into concrete yearly actions for the dashboard |
| `social-security-calculator.ts` | Claiming-age comparison (62/67/70) with lifetime present value and breakeven age |
| `monte-carlo.ts` / `monte-carlo-returns.ts` | 5,000-trial simulation using a geometric-mean-anchored stationary block bootstrap of historical returns; chunked so the UI never freezes |

## ðŸ› ï¸ Local Setup

1. **Install dependencies**
   ```bash
   cd retirement-planner
   npm install
   ```

2. **Start the dev server**
   ```bash
   npm start
   ```
   Open `http://localhost:4200/`. **Supabase is optional** â€” without credentials the app runs entirely on in-memory state (`local-state.service.ts`) with seeded defaults; only saving/loading scenarios and login are disabled.

3. **(Optional) Configure Supabase persistence**
   - Create a project at [Supabase](https://supabase.com).
   - Run `supabase/migrations/0001_init.sql` in the Supabase SQL Editor to provision tables and Row Level Security policies.
   - For local dev, fill `supabaseUrl` / `supabaseAnonKey` in `src/environments/environment.ts`.
   - For production, set the `SUPABASE_URL` / `SUPABASE_ANON_KEY` environment variables (e.g. in Vercel) â€” the build runs `set-env.js`, which generates `environment.production.ts` automatically. **Never hand-edit `environment.production.ts`**; it is overwritten on every build.

4. **Run unit tests**
   ```bash
   npm test                 # watch mode
   ng test --watch=false    # single run (CI-style)
   ```

5. **Build for production**
   ```bash
   npm run build
   ```
   Artifacts are written to `dist/`.

## ðŸ“Œ Future Scope

- IRMAA MAGI threshold detection and Medicare Part B/D surcharge modeling.
- Social Security benefit taxability rules (up to 85% taxable via provisional income).
- Married-filing-jointly support (tax tables currently cover single filers, 2026).
- Persisting Monte Carlo results and historical calculation snapshots.

## âš ï¸ Disclaimer

This is a modeling tool, not financial or tax advice. Tax tables cover a single filing status and year, and projections depend entirely on the assumptions you enter. Consult a qualified professional before acting on any strategy.

---

# é€€ä¼‘ç­–ç•¥è®¡ç®—å™¨ (Retirement Strategy Calculator)

ä¸€ä¸ªåŸºäºŽ Angular å’Œ Supabase æž„å»ºçš„çº¯å®¢æˆ·ç«¯ä¸ªäººç†è´¢å·¥å…·ï¼Œç”¨äºŽåœ¨æ•´ä¸ªäººç”Ÿè·¨åº¦å†…æ¨¡æ‹Ÿé€€ä¼‘ææ¬¾ç­–ç•¥ â€”â€” Roth è½¬æ¢ã€æ³•å®šæœ€ä½Žå–æ¬¾é¢ (RMD)ã€ç¤¾ä¼šå®‰å…¨é‡‘é¢†å–æ—¶æœºã€ä»¥åŠ Buy-Borrow-Die ç­–ç•¥ï¼Œå¹¶é€šè¿‡è’™ç‰¹å¡æ´›æ¨¡æ‹Ÿå¯¹æœ€ä¼˜æ–¹æ¡ˆè¿›è¡ŒåŽ‹åŠ›æµ‹è¯•ã€‚

## ðŸŽ¯ åŠŸèƒ½æ¦‚è¿°

è¯¥å·¥å…·æ—¨åœ¨æ›¿ä»£é›¶æ•£çš„ç”µå­è¡¨æ ¼åˆ†æžï¼Œæä¾›ä¸€ä¸ªå¯å¤ç”¨ã€å¯æµ‹è¯•çš„æ¨¡åž‹ï¼Œä½¿ä½ èƒ½å¤Ÿï¼š

- **å½•å…¥è´¦æˆ·å¿«ç…§** â€”â€” 401(k)ã€ä¼ ç»Ÿ IRAã€Roth IRA ä»¥åŠåº”ç¨Žè¯åˆ¸è´¦æˆ·ã€‚
- **å¤šç­–ç•¥å¯¹æ¯”** â€”â€” å°†"ä¸åšä»»ä½•æ“ä½œ"çš„åŸºçº¿æƒ…æ™¯ä¸Žå„ç±» Roth è½¬æ¢ç­–ç•¥ï¼ˆå›ºå®šé‡‘é¢ã€å¡«æ»¡ç¨ŽçŽ‡åŒºé—´ã€è‡ªåŠ¨ä¼˜åŒ–ã€å¹³æ»‘æ”¶å…¥ç›®æ ‡ï¼‰å¹¶æŽ’æ¯”è¾ƒã€‚
- **æŒ‰èµ„äº§ç±»åˆ«é€‰æ‹©ç­–ç•¥** â€”â€” ç­–ç•¥é€‰æ‹©å™¨åˆ†åˆ«åˆ¤æ–­ Roth è½¬æ¢ï¼ˆé’ˆå¯¹ç¨Žå‰èµ„é‡‘ï¼‰å’Œ Buy-Borrow-Dieï¼ˆé’ˆå¯¹è¯åˆ¸è´¦æˆ·èµ„é‡‘ï¼‰æ˜¯å¦å„è‡ªåˆ›é€ ä»·å€¼ï¼Œå› ä¸ºä¸¤è€…ä½œç”¨äºŽäº’ä¸é‡å çš„èµ„é‡‘ã€‚
- **ç”Ÿæˆå…·ä½“è¡ŒåŠ¨è®¡åˆ’** â€”â€” ä»ªè¡¨ç›˜å°†èƒœå‡ºçš„ç¨ŽåŠ¡ç­¹èµ„ç­–ç•¥è½¬åŒ–ä¸ºé€å¹´æ‰§è¡Œæ­¥éª¤ã€‚
- **é‡åŒ–é£Žé™©** â€”â€” è’™ç‰¹å¡æ´›é¡µé¢å°†é€‰å®šæ–¹æ¡ˆæ”¾å…¥æ•°åƒæ¡éšæœºå¸‚åœºæ”¶ç›Šåºåˆ—ï¼ˆåŽ†å²åŒºå—è‡ªåŠ©æŠ½æ ·ï¼‰ä¸­è¿è¡Œï¼ŒæŠ¥å‘Š"èµ„é‡‘ç»ˆèº«ä¸æž¯ç«­"çš„æˆåŠŸæ¦‚çŽ‡ï¼Œå¹¶ç»˜åˆ¶æŒ‰å¹´é¾„åˆ†å¸ƒçš„èµ„äº§ç™¾åˆ†ä½æ‰‡å½¢å›¾ã€‚

## ðŸ“± é¡µé¢å¯¼èˆª

| è·¯ç”± | ç”¨é€” |
|---|---|
| `/dashboard` | ç­–ç•¥å¯¹æ¯”ã€èƒœå‡ºç­–ç•¥å›¾è¡¨ã€é€å¹´è¡ŒåŠ¨è®¡åˆ’ |
| `/accounts` | å½•å…¥å’Œç®¡ç†é€€ä¼‘è´¦æˆ·å¿«ç…§ |
| `/scenarios` | æž„å»ºæƒ…æ™¯ï¼šå¹´é¾„ã€æ”¯å‡ºã€æ”¶ç›ŠçŽ‡å‡è®¾ã€è½¬æ¢ç­–ç•¥ |
| `/monte-carlo` | æˆåŠŸæ¦‚çŽ‡ã€æœŸæœ«èµ„äº§ç™¾åˆ†ä½ã€æ‰‡å½¢å›¾ |
| `/login` | åŸºäºŽ Supabase çš„ç™»å½•ï¼ˆå¯é€‰ â€”â€” ä¸ç™»å½•ä¹Ÿå¯å®Œæ•´ä½¿ç”¨ï¼‰ |

## ðŸš€ æŠ€æœ¯æ ˆ

- **å‰ç«¯**: Angular 20ï¼ˆç‹¬ç«‹ç»„ä»¶ + Signalsï¼Œæ—  NgModulesï¼‰
- **UI**: Angular Material + ngx-charts æ•°æ®å¯è§†åŒ–
- **æŒä¹…åŒ–ï¼ˆå¯é€‰ï¼‰**: Supabase (PostgreSQL + Auth)ï¼Œç”¨äºŽä¿å­˜æƒ…æ™¯å’Œè´¦æˆ·
- **æ‰˜ç®¡å¹³å°**: Vercelï¼ˆSPA å•é¡µåº”ç”¨æ¨¡å¼ï¼‰
- **æ ¸å¿ƒè®¡ç®—**: çº¯ TypeScript å‡½æ•°ï¼Œä¸Žæ¡†æž¶æ— å…³ â€”â€” æ•´ä¸ªè®¡ç®—å¼•æ“Žåœ¨æµè§ˆå™¨ä¸­è¿è¡Œï¼Œæ— éœ€æœåŠ¡å™¨äº¤äº’

## ðŸ§® è®¡ç®—å¼•æ“Ž

æ ¸å¿ƒé€»è¾‘ä½äºŽ `src/app/core/calculators/`ï¼Œå…¨éƒ¨ä¸ºçº¯å‡½æ•°ã€ä¸å¯å˜æ•°æ®ã€å¸¦å•å…ƒæµ‹è¯•ï¼š

| æ¨¡å— | èŒè´£ |
|---|---|
| `tax-tables.ts` | è”é‚¦ç¨ŽçŽ‡åŒºé—´å’Œæ ‡å‡†æ‰£é™¤é¢ï¼ˆ2026 å¹´ï¼Œå•èº«ç”³æŠ¥ï¼‰ï¼Œå«ç¨Žçº§é€šèƒ€è°ƒæ•´ |
| `tax-bracket-calculator.ts` | è¶…é¢ç´¯è¿›ç¨ŽçŽ‡è®¡ç®—ï¼šè¾¹é™…ç¨ŽçŽ‡ã€åŒºé—´å‰©ä½™é¢åº¦ã€ç¨ŽçŽ‡ä¸Šé™ |
| `rmd-calculator.ts` | IRS ç»Ÿä¸€ç”Ÿå‘½å‘¨æœŸè¡¨é™¤æ•°ï¼›SECURE 2.0 èµ·å§‹å¹´é¾„ï¼ˆæŒ‰å‡ºç”Ÿå¹´ä»½ä¸º 73 æˆ– 75 å²ï¼‰ |
| `roth-conversion-calculator.ts` | é€å¹´æ¨¡æ‹Ÿä¸»å¾ªçŽ¯ï¼šRMDã€ç¤¾ä¼šå®‰å…¨é‡‘ã€è½¬æ¢ã€ç¨Žè´Ÿã€èµ„äº§å¢žé•¿ |
| `scenario-engine.ts` | æƒ…æ™¯è¿è¡Œå…¥å£ï¼›`auto-optimize` æ¨¡å¼ä¸‹éåŽ†å„ç¨ŽçŽ‡åŒºé—´ä¸Šé™å¯»ä¼˜ |
| `strategy-selector.ts` | é€šè¿‡é€å¹´æ¨¡æ‹Ÿä¸¤æ¡ç­¹èµ„è·¯å¾„ï¼ŒæŒ‰èµ„äº§ç±»åˆ«åˆ¤å®š Roth è½¬æ¢ vs. Buy-Borrow-Die |
| `action-plan.ts` | å°†èƒœå‡ºç­–ç•¥è½¬åŒ–ä¸ºä»ªè¡¨ç›˜ä¸Šçš„é€å¹´å…·ä½“è¡ŒåŠ¨ |
| `social-security-calculator.ts` | é¢†å–å¹´é¾„å¯¹æ¯”ï¼ˆ62/67/70ï¼‰ï¼Œå«ç»ˆèº«çŽ°å€¼ä¸Žç›ˆäºå¹³è¡¡å¹´é¾„ |
| `monte-carlo.ts` / `monte-carlo-returns.ts` | 5,000 æ¬¡æ¨¡æ‹Ÿï¼Œé‡‡ç”¨å‡ ä½•å‡å€¼é”šå®šçš„å¹³ç¨³åŒºå—è‡ªåŠ©æŠ½æ ·é‡æ”¾åŽ†å²æ”¶ç›Šåºåˆ—ï¼›åˆ†å—æ‰§è¡Œä»¥ä¿è¯ UI ä¸å¡é¡¿ |

## ðŸ› ï¸ æœ¬åœ°å¼€å‘è®¾ç½®

1. **å®‰è£…ä¾èµ–**
   ```bash
   cd retirement-planner
   npm install
   ```

2. **å¯åŠ¨å¼€å‘æœåŠ¡å™¨**
   ```bash
   npm start
   ```
   è®¿é—® `http://localhost:4200/`ã€‚**Supabase æ˜¯å¯é€‰çš„** â€”â€” æœªé…ç½®å‡­æ®æ—¶ï¼Œåº”ç”¨å®Œå…¨åŸºäºŽå†…å­˜çŠ¶æ€è¿è¡Œï¼ˆ`local-state.service.ts`ï¼Œå«é¢„è®¾é»˜è®¤æ•°æ®ï¼‰ï¼Œä»…ä¿å­˜/åŠ è½½æƒ…æ™¯å’Œç™»å½•åŠŸèƒ½ä¸å¯ç”¨ã€‚

3. **ï¼ˆå¯é€‰ï¼‰é…ç½® Supabase æŒä¹…åŒ–**
   - åœ¨ [Supabase](https://supabase.com) ä¸­åˆ›å»ºé¡¹ç›®ã€‚
   - åœ¨ Supabase SQL ç¼–è¾‘å™¨ä¸­è¿è¡Œ `supabase/migrations/0001_init.sql`ï¼Œåˆå§‹åŒ–æ•°æ®åº“è¡¨å’Œè¡Œçº§å®‰å…¨ (RLS) ç­–ç•¥ã€‚
   - æœ¬åœ°å¼€å‘ï¼šåœ¨ `src/environments/environment.ts` ä¸­å¡«å…¥ `supabaseUrl` / `supabaseAnonKey`ã€‚
   - ç”Ÿäº§çŽ¯å¢ƒï¼šè®¾ç½® `SUPABASE_URL` / `SUPABASE_ANON_KEY` çŽ¯å¢ƒå˜é‡ï¼ˆå¦‚åœ¨ Vercel ä¸­ï¼‰â€”â€” æž„å»ºæ—¶ `set-env.js` ä¼šè‡ªåŠ¨ç”Ÿæˆ `environment.production.ts`ã€‚**åˆ‡å‹¿æ‰‹åŠ¨ç¼–è¾‘ `environment.production.ts`**ï¼Œæ¯æ¬¡æž„å»ºéƒ½ä¼šå°†å…¶è¦†ç›–ã€‚

4. **è¿è¡Œå•å…ƒæµ‹è¯•**
   ```bash
   npm test                 # ç›‘å¬æ¨¡å¼
   ng test --watch=false    # å•æ¬¡è¿è¡Œï¼ˆCI æ¨¡å¼ï¼‰
   ```

5. **ç”Ÿäº§çŽ¯å¢ƒæ‰“åŒ…**
   ```bash
   npm run build
   ```
   äº§ç‰©è¾“å‡ºåˆ° `dist/` ç›®å½•ã€‚

## ðŸ“Œ æœªæ¥è§„åˆ’

- IRMAA MAGI é—¨æ§›æ£€æµ‹åŠ Medicare Part B/D é™„åŠ ä¿è´¹å»ºæ¨¡ã€‚
- ç¤¾ä¼šå®‰å…¨é‡‘å¾ç¨Žè§„åˆ™ï¼ˆåŸºäºŽä¸´æ—¶æ”¶å…¥ï¼Œæœ€é«˜ 85% åº”ç¨Žï¼‰ã€‚
- æ”¯æŒå¤«å¦»è”åˆç”³æŠ¥ (MFJ)ï¼ˆå½“å‰ç¨Žè¡¨ä»…è¦†ç›– 2026 å¹´å•èº«ç”³æŠ¥ï¼‰ã€‚
- è’™ç‰¹å¡æ´›ç»“æžœåŠåŽ†å²è®¡ç®—å¿«ç…§çš„æŒä¹…åŒ–ä¿å­˜ã€‚

## âš ï¸ å…è´£å£°æ˜Ž

æœ¬å·¥å…·ä»…ç”¨äºŽå»ºæ¨¡åˆ†æžï¼Œä¸æž„æˆè´¢åŠ¡æˆ–ç¨ŽåŠ¡å»ºè®®ã€‚ç¨Žè¡¨ä»…è¦†ç›–å•ä¸€ç”³æŠ¥èº«ä»½å’Œå¹´åº¦ï¼Œé¢„æµ‹ç»“æžœå®Œå…¨å–å†³äºŽä½ è¾“å…¥çš„å‡è®¾ã€‚åœ¨æ‰§è¡Œä»»ä½•ç­–ç•¥å‰ï¼Œè¯·å’¨è¯¢åˆæ ¼çš„ä¸“ä¸šäººå£«ã€‚
