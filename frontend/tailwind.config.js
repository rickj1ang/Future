/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 暗色"终端/交易终端"风：炭灰底 + 层次面板 + 克制强调
        ink: '#0a0c10', // 应用底（近黑）
        panel: '#11141b', // 面板底（左栏 / 输入区）
        elevated: '#171a22', // 浮起卡片（气泡 / 持仓 / 订单）
        elevated2: '#1d212b', // hover / 次级浮起
        line: '#222632', // 描边
        line2: '#2a2f3d', // 强一点的描边（hover 等）
        primary: '#e6e8ee', // 主文字
        secondary: '#9aa3b2', // 次文字
        muted: '#5b6478', // 弱文字 / 占位
        brand: '#c8a45c', // 品牌金（克制点缀，标题/强调）
        up: '#e55151', // 涨 / 买（A 股习惯）
        down: '#249954', // 跌 / 卖
      },
    },
  },
  plugins: [
    // 给 AI 回复的 markdown 加排版（暗色用 prose-invert）
    require('@tailwindcss/typography'),
  ],
}
