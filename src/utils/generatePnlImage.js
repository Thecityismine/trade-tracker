function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function generatePnlImage(trade) {
  const W = 1200;
  const H = 675;
  const PAD = 72;
  const FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Background ───────────────────────────────────────────
  ctx.fillStyle = '#060f1c';
  ctx.fillRect(0, 0, W, H);

  // Load and draw the background image — portrait image anchored to the right
  try {
    const bg = await loadImage('/pnl-tracker-bg.png');
    // Scale so height fills the canvas, anchor right edge flush with canvas right
    const scale = H / bg.height;
    const bw = bg.width * scale;
    ctx.drawImage(bg, W - bw, 0, bw, H);
  } catch (e) {
    console.warn('PNL background image failed to load:', e.message);
    // Fallback: concentric circles
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.07)';
    ctx.lineWidth = 1.5;
    const cx = W - 200;
    const cy = H / 2;
    for (let r = 40; r < 700; r += 38) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Left-side dark gradient so text is always readable over the artwork
  const leftGrad = ctx.createLinearGradient(0, 0, W, 0);
  leftGrad.addColorStop(0, 'rgba(6,15,28,1)');
  leftGrad.addColorStop(0.42, 'rgba(6,15,28,0.95)');
  leftGrad.addColorStop(0.62, 'rgba(6,15,28,0.55)');
  leftGrad.addColorStop(1, 'rgba(6,15,28,0.05)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, W, H);

  // Bottom gradient for date line
  const botGrad = ctx.createLinearGradient(0, H - 100, 0, H);
  botGrad.addColorStop(0, 'rgba(6,15,28,0)');
  botGrad.addColorStop(1, 'rgba(6,15,28,0.6)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H - 100, W, 100);

  // ── Derive trade data ─────────────────────────────────────
  const isWin = (trade.pnlPercent ?? 0) >= 0;
  const pnlColor = isWin ? '#22c55e' : '#ef4444';
  const direction = trade.direction === 'long' ? 'LONG' : 'SHORT';
  const dirColor = trade.direction === 'long' ? '#22c55e' : '#ef4444';
  const dirBgColor = trade.direction === 'long' ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)';
  const dirBorderColor = trade.direction === 'long' ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
  const ticker = (trade.ticker || 'BTC').toUpperCase();
  const leverage = trade.leverage ? `${trade.leverage}X` : '';
  const badgeText = leverage ? `${direction} ${leverage}` : direction;
  const pnlSign = (trade.pnlPercent ?? 0) >= 0 ? '+' : '';
  const pnlText = `${pnlSign}${(trade.pnlPercent ?? 0).toFixed(1)}%`;
  const entryPrice = trade.entryPrice
    ? Number(trade.entryPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '—';
  const exitPrice = trade.exitPrice
    ? Number(trade.exitPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '—';
  const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
  const dateStr = tradeDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  // ── Branding (top-left) ───────────────────────────────────
  let brandX = PAD;
  try {
    const icon = await loadImage('/trade-tracker-icon-transparent.png');
    const iconSize = 42;
    ctx.drawImage(icon, brandX, 46, iconSize, iconSize);
    brandX += iconSize + 14;
  } catch { /* no icon, skip */ }

  ctx.font = `bold 28px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('PNL Tracker', brandX, 76);

  // ── Ticker + Direction/Leverage badge ─────────────────────
  const TICKER_Y = 170;

  ctx.font = `bold 44px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(ticker, PAD, TICKER_Y);
  const tickerW = ctx.measureText(ticker).width;

  // Badge
  ctx.font = `bold 22px ${FONT}`;
  const badgePadX = 16;
  const badgeH = 38;
  const badgeW = ctx.measureText(badgeText).width + badgePadX * 2;
  const badgeX = PAD + tickerW + 18;
  const badgeTop = TICKER_Y - badgeH + 6;

  drawRoundRect(ctx, badgeX, badgeTop, badgeW, badgeH, 9);
  ctx.fillStyle = dirBgColor;
  ctx.fill();

  drawRoundRect(ctx, badgeX, badgeTop, badgeW, badgeH, 9);
  ctx.strokeStyle = dirBorderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = dirColor;
  ctx.fillText(badgeText, badgeX + badgePadX, badgeTop + 26);

  // ── Large PnL percentage ──────────────────────────────────
  const maxPnlWidth = W * 0.58;
  let pnlFontSize = 210;
  ctx.font = `bold ${pnlFontSize}px ${FONT}`;
  while (ctx.measureText(pnlText).width > maxPnlWidth && pnlFontSize > 80) {
    pnlFontSize -= 8;
    ctx.font = `bold ${pnlFontSize}px ${FONT}`;
  }

  ctx.fillStyle = pnlColor;
  ctx.fillText(pnlText, PAD, TICKER_Y + 48 + pnlFontSize);

  // ── Entry / Exit prices ───────────────────────────────────
  const priceY = H - 148;
  const col2 = PAD + 280;

  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillText('Entry Price', PAD, priceY);
  ctx.fillText('Exit Price', col2, priceY);

  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(entryPrice, PAD, priceY + 44);
  ctx.fillText(exitPrice, col2, priceY + 44);

  // ── Date ──────────────────────────────────────────────────
  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillText(dateStr, PAD, H - 34);

  return canvas;
}

export function downloadCanvas(canvas, filename = 'pnl-share.png') {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
