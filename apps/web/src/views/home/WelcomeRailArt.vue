<!--
  首页欢迎横幅中部插画：两支三节全伸缩滚珠滑轨（冰箱抽屉用），照真实产品画——镀锌亮银本色。
    - open  开口面：外轨 C 型槽里看得见黑色钢珠保持架 + 钢珠、尾端灰色阻尼缓冲器（带弹簧）；
    - mount 安装面：外轨背面冲压的凸形安装窗 / 圆孔 / 方孔 / 腰形孔，中轨内轨藏在外轨后面，只露伸出的一段。
  中轨 / 内轨以 14 秒为周期缓慢伸出、收回（两段位移叠加即全伸缩）。
  两支滑轨中间是一个隐藏式橱柜铰链（欧式杯状铰链，镀铬），照实物 3/4 视角画。烟花另见 WelcomeFireworks（Canvas）。
  纯装饰：aria-hidden；系统开了「减少动态效果」时静止。
-->
<template>
  <!-- viewBox 宽度按「滑轨 + 铰链 + 滑轨」本体的占位（约 x 45~585）取，居中后左右不留空白；伸出段超出部分由舞台裁剪 -->
  <svg class="rail-art" viewBox="0 0 630 84" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <defs>
      <!-- 镀铬：比镀锌反差更大，亮白与深灰相间的高光带 -->
      <linearGradient id="hg-chrome" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.22" stop-color="#d3d8df" />
        <stop offset="0.42" stop-color="#f7f9fb" />
        <stop offset="0.62" stop-color="#8f98a5" />
        <stop offset="0.8" stop-color="#dfe3e9" />
        <stop offset="1" stop-color="#aab2bd" />
      </linearGradient>
      <linearGradient id="hg-chrome-v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#e4e8ed" />
        <stop offset="0.55" stop-color="#9ea7b3" />
        <stop offset="0.8" stop-color="#e9ecf0" />
        <stop offset="1" stop-color="#b3bbc5" />
      </linearGradient>
      <radialGradient id="hg-cup" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.45" stop-color="#d9dee5" />
        <stop offset="0.8" stop-color="#9aa3af" />
        <stop offset="1" stop-color="#6f7885" />
      </radialGradient>
      <radialGradient id="hg-screw" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.55" stop-color="#b9c0ca" />
        <stop offset="1" stop-color="#6b7480" />
      </radialGradient>

      <!-- 镀锌钢板：冷调亮银，中间一道高光 -->
      <linearGradient id="ra-zinc" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f5f8fc" />
        <stop offset="0.28" stop-color="#dfe6ef" />
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="0.72" stop-color="#cdd6e1" />
        <stop offset="1" stop-color="#9aa6b6" />
      </linearGradient>
      <!-- 槽内侧：比外表面暗一档 -->
      <linearGradient id="ra-channel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b9c3d0" />
        <stop offset="0.5" stop-color="#e3e9f0" />
        <stop offset="1" stop-color="#aeb9c7" />
      </linearGradient>
      <linearGradient id="ra-inner" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.45" stop-color="#eef2f7" />
        <stop offset="1" stop-color="#aab5c3" />
      </linearGradient>
      <radialGradient id="ra-ball" cx="0.35" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.6" stop-color="#b6c0cc" />
        <stop offset="1" stop-color="#5b6675" />
      </radialGradient>
      <linearGradient id="ra-plastic" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a3a8a0" />
        <stop offset="1" stop-color="#6d736b" />
      </linearGradient>
      <filter id="ra-shadow" x="-10%" y="-60%" width="120%" height="220%">
        <feDropShadow dx="0" dy="1.6" stdDeviation="1.3" flood-color="#0f172a" flood-opacity="0.22" />
      </filter>

      <!-- 内轨：腰形孔 + 圆孔 + 黑色释放拨片；端部平口（不画挡块） -->
      <g id="ra-inner-rail">
        <rect x="-50" y="-2.6" width="102" height="5.2" rx="0.8" fill="url(#ra-inner)" stroke="#8793a3" stroke-width="0.35" />
        <line x1="-49" y1="-1.7" x2="51" y2="-1.7" stroke="#ffffff" stroke-width="0.4" opacity="0.8" />
        <rect x="-36" y="-0.8" width="4.2" height="1.6" rx="0.8" fill="#5b6675" />
        <circle cx="-22" cy="0" r="0.8" fill="#5b6675" />
        <rect x="18" y="-1.3" width="7" height="2.6" rx="0.5" fill="#1f2937" />
        <circle cx="38" cy="0" r="0.8" fill="#5b6675" />
        <rect x="42" y="-0.75" width="4.6" height="1.5" rx="0.75" fill="#5b6675" />
      </g>
    </defs>

    <g
      v-for="(s, i) in SLIDES" :key="i"
      :transform="`translate(${s.x} ${s.y}) rotate(${s.rot}) scale(${s.flip ? -s.scale : s.scale} ${s.scale})`"
      filter="url(#ra-shadow)"
    >
      <!-- ============ 开口面：外轨槽 → 缓冲器 → 中轨 + 保持架 → 内轨，由后往前叠 ============ -->
      <template v-if="s.variant === 'open'">
        <!-- 外轨：上下翻边 + 槽内侧 -->
        <rect x="-60" y="-6.5" width="120" height="13" rx="1.4" fill="url(#ra-channel)" stroke="#7c8796" stroke-width="0.45" />
        <rect x="-60" y="-6.5" width="120" height="1.9" fill="url(#ra-zinc)" />
        <rect x="-60" y="4.6" width="120" height="1.9" fill="url(#ra-zinc)" />
        <circle cx="-2" cy="-5.6" r="0.55" fill="#6b7686" />
        <!-- 尾端阻尼缓冲器：灰色塑料壳 + 弹簧 -->
        <rect x="-59" y="-4.3" width="20" height="8.6" rx="0.8" fill="url(#ra-plastic)" stroke="#555b53" stroke-width="0.3" />
        <rect x="-57.5" y="-1" width="5" height="2" rx="0.4" fill="#4a5048" />
        <polyline points="-50,0 -49,-1.8 -48,1.8 -47,-1.8 -46,1.8 -45,-1.8 -44,1.8 -43,-1.8 -42,0" fill="none" stroke="#3f443d" stroke-width="0.45" />
        <circle cx="-54" cy="2.6" r="0.7" fill="#d9ddd6" />
        <!-- 中轨（带保持架）与内轨：一起伸出 -->
        <g class="rail-move" :style="{ '--ext': `${s.ext}px`, animationDelay: `${s.delay}s` }">
          <rect x="-36" y="-4.4" width="92" height="8.8" rx="1" fill="url(#ra-zinc)" stroke="#8793a3" stroke-width="0.4" />
          <!-- 黑色保持架 + 两排钢珠（上下各一排露在内轨两侧） -->
          <rect x="-34" y="-3.9" width="54" height="7.8" rx="0.8" fill="#2b3340" />
          <circle v-for="bx in BALLS" :key="`t${bx}`" :cx="bx" cy="-3" r="0.95" fill="url(#ra-ball)" />
          <circle v-for="bx in BALLS" :key="`b${bx}`" :cx="bx" cy="3" r="0.95" fill="url(#ra-ball)" />
          <circle cx="-6" cy="0" r="0.6" fill="#94a3b8" />
          <g class="rail-move" :style="{ '--ext': `${s.ext}px`, animationDelay: `${s.delay}s` }">
            <use href="#ra-inner-rail" />
          </g>
        </g>
      </template>

      <!-- ============ 安装面：中轨内轨在外轨后面，外轨背面冲压孔在最前 ============ -->
      <template v-else>
        <g class="rail-move" :style="{ '--ext': `${s.ext}px`, animationDelay: `${s.delay}s` }">
          <rect x="-50" y="-4.4" width="104" height="8.8" rx="1" fill="url(#ra-zinc)" stroke="#8793a3" stroke-width="0.4" />
          <!-- 中轨端部的方窗（伸出后看得见） -->
          <rect x="40" y="-1.6" width="9" height="3.2" rx="0.4" fill="#1f2937" opacity="0.85" />
          <g class="rail-move" :style="{ '--ext': `${s.ext}px`, animationDelay: `${s.delay}s` }">
            <use href="#ra-inner-rail" />
          </g>
        </g>
        <!-- 外轨背面 -->
        <rect x="-60" y="-6.5" width="120" height="13" rx="1.4" fill="url(#ra-zinc)" stroke="#7c8796" stroke-width="0.45" />
        <line x1="-59.5" y1="-4.8" x2="59.5" y2="-4.8" stroke="#ffffff" stroke-width="0.5" opacity="0.9" />
        <line x1="-59.5" y1="4.9" x2="59.5" y2="4.9" stroke="#8f9bab" stroke-width="0.5" />
        <!-- 冲压凸形安装窗：外框暗、中间留一片压出的舌片 -->
        <g v-for="wx in WINDOWS" :key="wx" :transform="`translate(${wx} 0)`">
          <path d="M-4.2 -2.8 H4.2 V-1.2 H5.6 V1.2 H4.2 V2.8 H-4.2 Z" fill="#3b4452" />
          <rect x="-2.6" y="-1.5" width="5.2" height="3" rx="0.4" fill="url(#ra-inner)" />
          <circle cx="0" cy="0" r="0.55" fill="#3b4452" />
          <circle cx="-7" cy="0" r="0.75" fill="#3b4452" />
          <rect x="8" y="-0.6" width="2.6" height="1.2" rx="0.6" fill="#3b4452" />
        </g>
        <rect x="-53.5" y="-0.7" width="1.4" height="1.4" fill="#3b4452" />
        <circle cx="-57.4" cy="2.9" r="0.75" fill="#3b4452" />
        <rect x="-18" y="-0.6" width="2.8" height="1.2" rx="0.6" fill="#3b4452" />
      </template>
    </g>

    <!-- ============ 隐藏式铰链（局部坐标约 100×84，由后往前叠：底座 → 臂身 → 连杆 → 铰杯 → 翼片 → 护盖） ============ -->
    <g transform="translate(268 3) scale(0.86)" filter="url(#ra-shadow)">
      <!-- 底座安装板：上下两片带腰形孔的耳板 + 中间收腰，微微向右倾 -->
      <g transform="translate(80 58) rotate(-18)">
        <path
          d="M-10 -28 Q0 -33 10 -28 L12 -14 L7.5 -9 L7.5 9 L12 14 L10 28 Q0 33 -10 28 L-12 14 L-7.5 9 L-7.5 -9 L-12 -14 Z"
          fill="url(#hg-chrome)" stroke="#7a838f" stroke-width="0.5"
        />
        <path d="M-9 -27 Q0 -31.5 9 -27" fill="none" stroke="#ffffff" stroke-width="0.7" />
        <rect x="-5.5" y="-23.5" width="11" height="4.6" rx="2.3" fill="#2d333b" />
        <rect x="-4.6" y="-22.9" width="9.2" height="1.2" rx="0.6" fill="#59616c" />
        <rect x="-5.5" y="18.9" width="11" height="4.6" rx="2.3" fill="#2d333b" />
        <rect x="-4.6" y="19.5" width="9.2" height="1.2" rx="0.6" fill="#59616c" />
        <circle cx="0" cy="3" r="2.4" fill="#2d333b" />
        <!-- 深度调节螺丝 -->
        <circle cx="5" cy="11" r="3" fill="url(#hg-screw)" stroke="#6b7480" stroke-width="0.4" />
        <line x1="3.2" y1="11" x2="6.8" y2="11" stroke="#4b535e" stroke-width="0.7" />
      </g>

      <!-- 臂身：从护盖斜向右下压在底座上，两侧翻边 + 覆盖调节螺丝 + 固定螺丝 -->
      <!-- 臂身末端（x≈+20）正好落在底座中央，与实物一样沿底座斜压 -->
      <g transform="translate(62 50) rotate(32)">
        <rect x="-22" y="-8" width="44" height="16" rx="2.6" fill="url(#hg-chrome-v)" stroke="#6f7885" stroke-width="0.5" />
        <rect x="-22" y="-8" width="44" height="3" rx="1.5" fill="#f8fafc" opacity="0.85" />
        <rect x="-22" y="5.4" width="44" height="2.6" rx="1.3" fill="#8a93a0" />
        <rect x="-14" y="-2.4" width="10" height="4.8" rx="1" fill="#3a414b" />
        <rect x="-12.8" y="-1.4" width="7.6" height="1.2" rx="0.6" fill="#77808c" />
        <circle cx="7" cy="0" r="3.3" fill="url(#hg-screw)" stroke="#5f6874" stroke-width="0.4" />
        <line x1="5" y1="0" x2="9" y2="0" stroke="#3f4650" stroke-width="0.8" />
        <line x1="7" y1="-2" x2="7" y2="2" stroke="#3f4650" stroke-width="0.8" />
        <circle cx="17" cy="0.5" r="2.2" fill="url(#hg-screw)" stroke="#5f6874" stroke-width="0.4" />
        <line x1="15.6" y1="0.5" x2="18.4" y2="0.5" stroke="#3f4650" stroke-width="0.6" />
      </g>

      <!-- 连杆转轴：护盖与臂身之间的两根销轴 + 连板 -->
      <g transform="translate(47 45)">
        <path d="M-6 -4 L4 2 L1 7 L-9 1 Z" fill="#9aa3af" stroke="#5f6874" stroke-width="0.4" />
        <circle cx="-5" cy="-2" r="2.3" fill="url(#hg-screw)" stroke="#5f6874" stroke-width="0.4" />
        <circle cx="1.5" cy="4" r="2" fill="url(#hg-screw)" stroke="#5f6874" stroke-width="0.4" />
      </g>

      <!-- 铰杯：埋进门板的圆杯，压在翼片下露出下半圈 -->
      <circle cx="35" cy="42" r="17" fill="url(#hg-cup)" stroke="#6f7885" stroke-width="0.5" />
      <path d="M19 45 A17 17 0 0 0 51 45" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.7" />

      <!-- 翼片：斜贯左上的长圆板，两端各一个螺丝孔 -->
      <g transform="translate(33 32) rotate(-42)">
        <rect x="-34" y="-11" width="68" height="22" rx="11" fill="url(#hg-chrome)" stroke="#6f7885" stroke-width="0.5" />
        <path d="M-26 -10 H26" stroke="#ffffff" stroke-width="0.8" opacity="0.9" />
        <g v-for="hx in [-23, 23]" :key="hx" :transform="`translate(${hx} 0)`">
          <circle r="5" fill="#c4cad2" stroke="#7a838f" stroke-width="0.4" />
          <circle r="3.1" fill="#2d333b" />
          <path d="M-2.2 -1.4 A2.6 2.6 0 0 1 1.4 -2.2" fill="none" stroke="#8d96a2" stroke-width="0.5" />
        </g>
      </g>

      <!-- 护盖：翼片中央隆起的方盒，顶面带长方窗 -->
      <g transform="translate(40 34) rotate(36)">
        <rect x="-13" y="-11" width="28" height="22" rx="6" fill="url(#hg-chrome-v)" stroke="#6f7885" stroke-width="0.5" />
        <rect x="-13" y="-11" width="28" height="9" rx="4.5" fill="#fbfcfd" opacity="0.9" />
        <path d="M-11 -2 H13" stroke="#8a93a0" stroke-width="0.6" />
        <rect x="3" y="-7.2" width="9" height="5" rx="1" fill="#39404a" />
        <rect x="4" y="-6.6" width="7" height="1.3" rx="0.6" fill="#7b8490" />
        <path d="M-12 7 Q1 12 14 7" fill="none" stroke="#6f7885" stroke-width="0.6" />
      </g>
    </g>
  </svg>
</template>

<script setup lang="ts">
/**
 * 两支滑轨：上开口面、下安装面，各自朝外伸出（flip = 朝左伸），伸出时不交叠。
 * scale 以横幅高度 84 为基准：1.9 倍时一支长约 230、宽约 25。
 */
const SLIDES = [
  { variant: 'open', x: 150, y: 44, rot: -7, scale: 1.75, ext: 34, delay: 0, flip: true },
  { variant: 'mount', x: 470, y: 42, rot: 5, scale: 1.9, ext: 36, delay: 3.6, flip: false },
] as const;
/** 保持架上的钢珠（开口面） */
const BALLS = [-31, -27.5, -24, -20.5, -17, -13.5, -10, 2, 5.5, 9, 12.5, 16];
/** 安装面外轨上的凸形安装窗位置 */
const WINDOWS = [-36, 6, 34];
</script>

<style scoped lang="scss">
.rail-art {
  display: block;
  height: 100%;
  width: auto;
  overflow: visible;
}

/* 中轨、内轨各伸出一段：内轨嵌在中轨里，两段位移叠加就是全伸缩 */
.rail-move {
  animation: rail-extend 14s ease-in-out infinite;
}
@keyframes rail-extend {
  0%, 18% { transform: translateX(0); }
  42%, 70% { transform: translateX(var(--ext)); }
  94%, 100% { transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .rail-move { animation: none; transform: translateX(calc(var(--ext) * 0.5)); }
}
</style>
