module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: { xBlue: '#0d2b4c', xAccent: '#1e90ff' },
      boxShadow: { 'ios-card': '0 6px 18px rgba(0,0,0,0.18)' },
      keyframes: {
        glow: { '0%,100%': { boxShadow:'0 0 0px rgba(255,255,255,0)' }, '50%': { boxShadow:'0 0 22px rgba(255,255,255,0.35)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        confettiFall: { '0%': { transform:'translateY(-20vh) rotate(0deg)' }, '100%': { transform:'translateY(80vh) rotate(360deg)'} },
        rainFall: { '0%': { transform:'translateY(-20vh)' }, '100%': { transform:'translateY(80vh)'} },
        flashRed: { '0%': { opacity: 0 }, '20%': { opacity: 0.5 }, '100%': { opacity: 0 } },
        popShow: { '0%': { transform:'scale(0.8)', opacity: 0 }, '20%': { transform:'scale(1.05)', opacity: 1 }, '100%': { transform:'scale(1)', opacity: 1 } }
      },
      animation: {
        glow: 'glow 1.3s ease-in-out infinite',
        shimmer: 'shimmer 1.2s linear infinite',
        confettiFall: 'confettiFall 1.2s ease-out forwards',
        rainFall: 'rainFall 0.9s ease-out forwards',
        flashRed: 'flashRed 0.6s ease-out',
        popShow: 'popShow 280ms ease-out'
      }
    },
  },
  plugins: [],
};
