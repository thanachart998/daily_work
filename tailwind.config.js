/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: {
    relative: true,
    files: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Inter Variable"',
          'var(--font-thai)',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
      borderRadius: {
        control: '10px',
        card: '14px',
        sheet: '20px',
      },
      colors: {
        // iOS Semantic Palette using CSS Variables
        ios: {
          bg: 'var(--color-bg)',
          card: 'var(--color-card)',
          elevated: 'var(--color-elevated)',
          grouped: 'var(--color-grouped)',
          fill: 'var(--color-fill)',
          'fill-secondary': 'var(--color-fill-secondary)',
          separator: 'var(--color-separator)',
          'separator-opaque': 'var(--color-separator-opaque)',
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          tint: 'var(--color-accent-tint)',
          subtle: 'var(--color-accent-subtle)',
          hover: 'var(--color-accent-hover)',
        },
        status: {
          done: 'var(--color-done)',
          'done-tint': 'var(--color-done-tint)',
          overdue: 'var(--color-overdue)',
          'overdue-tint': 'var(--color-overdue-tint)',
          warning: 'var(--color-warning)',
          'warning-tint': 'var(--color-warning-tint)',
          todo: 'var(--color-todo)',
          'todo-tint': 'var(--color-todo-tint)',
          review: 'var(--color-review)',
          'review-tint': 'var(--color-review-tint)',
        },
      },
      boxShadow: {
        ios: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'ios-sheet': '0 -4px 24px -2px rgba(0, 0, 0, 0.16)',
        'ios-card': '0 2px 8px -2px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
