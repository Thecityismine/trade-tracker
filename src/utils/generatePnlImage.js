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
  // Portrait canvas — same aspect ratio as a phone screenshot
  const W = 630;
  const H = 1120;
  const PAD = 44;
  const FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Background: fill entire canvas with portrait image ────
  ctx.fillStyle = '#07121e';
  ctx.fillRect(0, 0, W, H);

  try {
    const bg = await loadImage('/pnl-tracker-bg.png');
    // Scale to cover — image fills whole canvas, centered
    const scale = Math.max(W / bg.width, H / bg.height);
    const bw = bg.width * scale;
    const bh = bg.height * scale;
    ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
  } catch (e) {
    console.warn('PNL background image failed to load:', e.message);
    // Fallback: dark teal with circles
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.08)';
    ctx.lineWidth = 1.5;
    for (let r = 40; r < 900; r += 40) {
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.38, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Slight overall dark tint so text always has contrast
  ctx.fillStyle = 'rgba(7, 18, 30, 0.18)';
  ctx.fillRect(0, 0, W, H);

  // Bottom-up gradient — covers the text area, fades out before the bottom logo
  const botGrad = ctx.createLinearGradient(0, H * 0.36, 0, H * 0.88);
  botGrad.addColorStop(0, 'rgba(7,18,30,0)');
  botGrad.addColorStop(0.3, 'rgba(7,18,30,0.70)');
  botGrad.addColorStop(0.7, 'rgba(7,18,30,0.88)');
  botGrad.addColorStop(1, 'rgba(7,18,30,0.92)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H * 0.36, W, H * 0.52);

  // ── Trade data ────────────────────────────────────────────
  const isWin = (trade.pnlPercent ?? 0) >= 0;
  const pnlColor = isWin ? '#22c55e' : '#ef4444';
  const direction = trade.direction === 'long' ? 'LONG' : 'SHORT';
  const dirColor = trade.direction === 'long' ? '#22c55e' : '#ef4444';
  const dirBgColor = trade.direction === 'long' ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)';
  const dirBorderColor = trade.direction === 'long' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)';
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

  // ── Ticker + Direction/Leverage badge ─────────────────────
  const TICKER_Y = H * 0.46; // ~515px — upper-middle, clear of bottom logo

  ctx.font = `bold 52px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(ticker, PAD, TICKER_Y);
  const tickerW = ctx.measureText(ticker).width;

  ctx.font = `bold 22px ${FONT}`;
  const badgePadX = 15;
  const badgeH = 37;
  const badgeW = ctx.measureText(badgeText).width + badgePadX * 2;
  const badgeX = PAD + tickerW + 16;
  const badgeTop = TICKER_Y - badgeH + 5;

  drawRoundRect(ctx, badgeX, badgeTop, badgeW, badgeH, 8);
  ctx.fillStyle = dirBgColor;
  ctx.fill();
  drawRoundRect(ctx, badgeX, badgeTop, badgeW, badgeH, 8);
  ctx.strokeStyle = dirBorderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = dirColor;
  ctx.fillText(badgeText, badgeX + badgePadX, badgeTop + 25);

  // ── Large PnL percentage ──────────────────────────────────
  const maxPnlWidth = W - PAD * 2;
  let pnlFontSize = 155;
  ctx.font = `bold ${pnlFontSize}px ${FONT}`;
  while (ctx.measureText(pnlText).width > maxPnlWidth && pnlFontSize > 60) {
    pnlFontSize -= 6;
    ctx.font = `bold ${pnlFontSize}px ${FONT}`;
  }
  ctx.fillStyle = pnlColor;
  ctx.fillText(pnlText, PAD, TICKER_Y + 28 + pnlFontSize);

  // ── Divider line ──────────────────────────────────────────
  const divY = TICKER_Y + 28 + pnlFontSize + 36;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // ── Entry / Exit prices ───────────────────────────────────
  const priceY = divY + 38;
  const col2 = PAD + (W - PAD * 2) / 2;

  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillText('Entry Price', PAD, priceY);
  ctx.fillText('Exit Price', col2, priceY);

  ctx.font = `bold 38px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(entryPrice, PAD, priceY + 48);
  ctx.fillText(exitPrice, col2, priceY + 48);

  // ── Date ──────────────────────────────────────────────────
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillText(dateStr, PAD, priceY + 110);

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
