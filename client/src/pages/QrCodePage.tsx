import {
  Check,
  Copy,
  Download,
  FileCode2,
  Globe,
  ImagePlus,
  Infinity as InfinityIcon,
  Link2,
  Palette,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, SegmentedControl } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { generateQrMatrix, qrMatrixToSvg, type QrEccLevel } from '../lib/qrcode';

type QrMode = 'text' | 'wifi';

const COLOR_PRESETS = [
  { id: 'black', name: 'ดำมาตรฐาน', fg: '#000000', bg: '#FFFFFF' },
  { id: 'blue', name: 'น้ำเงินเข้ม', fg: '#004085', bg: '#FFFFFF' },
  { id: 'indigo', name: 'คราม', fg: '#312E81', bg: '#FFFFFF' },
  { id: 'emerald', name: 'เขียวเข้ม', fg: '#064E3B', bg: '#FFFFFF' },
  { id: 'slate', name: 'เทาเข้ม', fg: '#1E293B', bg: '#F8FAFC' },
];

const SIZE_OPTIONS = [
  { value: '256', label: '256 px' },
  { value: '512', label: '512 px' },
  { value: '1024', label: '1024 px (คมชัดสูง)' },
];

const LOGO_SCALE_OPTIONS = [
  { value: '0.16', label: 'เล็ก (16%)' },
  { value: '0.20', label: 'มาตรฐาน (20%)' },
  { value: '0.24', label: 'ใหญ่ (24%)' },
];

const ECC_OPTIONS: { value: QrEccLevel; label: string; desc: string }[] = [
  { value: 'L', label: 'L (7%)', desc: 'ความจุสูง เหมาะกับข้อความยาว' },
  { value: 'M', label: 'M (15%)', desc: 'สมดุลมาตรฐาน (แนะนำ)' },
  { value: 'Q', label: 'Q (25%)', desc: 'ทนทานต่อรอยขีดข่วนดี' },
  { value: 'H', label: 'H (30%)', desc: 'ความทนทานสูงสุด (เหมาะกับใส่โลโก้)' },
];

function escapeWifiField(str: string): string {
  return str.replace(/([\\;,"'])/g, '\\$1');
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** หน้าสร้าง QR Code แบบออฟไลน์ 100% (ไม่มีวันหมดอายุ พร้อมรองรับโลโก้ตรงกลางแบบไม่เก็บไฟล์ค้างในระบบ) */
export default function QrCodePage() {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<QrMode>('text');
  const [textValue, setTextValue] = useState<string>(() => {
    try {
      return window.location.origin || 'https://example.com';
    } catch {
      return 'https://example.com';
    }
  });

  // Wi-Fi fields
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiAuth, setWifiAuth] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [wifiHidden, setWifiHidden] = useState(false);

  // Customization
  const [ecc, setEcc] = useState<QrEccLevel>('M');
  const [sizePx, setSizePx] = useState<number>(512);
  const [colorPresetId, setColorPresetId] = useState<string>('black');
  const [caption, setCaption] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Center Logo (In-memory only, never persisted to DB or localStorage)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string>('');
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoScale, setLogoScale] = useState<number>(0.2);
  const [autoClearLogo, setAutoClearLogo] = useState<boolean>(true);

  const clearLogoCache = useCallback((silent = false) => {
    setLogoDataUrl(null);
    setLogoName('');
    setLogoImg((prev) => {
      if (prev) {
        prev.src = '';
      }
      return null;
    });
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
    if (!silent) {
      toast.info('ล้างแคชรูปภาพโลโก้ในหน่วยความจำเรียบร้อยแล้ว');
    }
  }, [toast]);

  // Ensure any in-memory logo is purged when leaving the page
  useEffect(() => {
    return () => {
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    };
  }, []);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Immediately clear file input so browser does not retain file handle
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น (.png, .jpg, .svg, .webp)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('ขนาดไฟล์โลโก้ต้องไม่เกิน 5 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) return;

      const img = new Image();
      img.onload = () => {
        setLogoDataUrl(result);
        setLogoImg(img);
        setLogoName(file.name);
        // Automatically use High (30%) error correction so QR scans reliably with center logo
        setEcc('H');
        toast.success('วางโลโก้ตรงกลาง QR Code แล้ว (ปรับ Error Correction เป็นระดับ H อัตโนมัติ)');
      };
      img.onerror = () => {
        toast.error('ไม่สามารถอ่านไฟล์รูปภาพนี้ได้');
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const selectedColor = useMemo(
    () => COLOR_PRESETS.find((c) => c.id === colorPresetId) ?? COLOR_PRESETS[0],
    [colorPresetId],
  );

  const payload = useMemo(() => {
    if (mode === 'wifi') {
      if (!wifiSsid.trim()) return '';
      const s = escapeWifiField(wifiSsid.trim());
      const p = wifiAuth === 'nopass' ? '' : escapeWifiField(wifiPassword);
      const h = wifiHidden ? 'H:true;' : '';
      return `WIFI:T:${wifiAuth};S:${s};P:${p};${h};`;
    }
    return textValue.trim();
  }, [mode, textValue, wifiSsid, wifiPassword, wifiAuth, wifiHidden]);

  const qrResult = useMemo(() => {
    if (!payload) return { matrix: null, svg: '', error: null as string | null };
    try {
      const matrix = generateQrMatrix(payload, ecc);
      const svg = qrMatrixToSvg(matrix, {
        margin: 4,
        fgColor: selectedColor.fg,
        bgColor: selectedColor.bg,
        logoDataUrl,
        logoScale,
      });
      return { matrix, svg, error: null };
    } catch (err) {
      return { matrix: null, svg: '', error: (err as Error).message };
    }
  }, [payload, ecc, selectedColor, logoDataUrl, logoScale]);

  // Render onto hidden canvas for PNG download / copy (including center logo if present)
  const renderToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const matrix = qrResult.matrix;
    if (!canvas || !matrix) return null;

    const margin = 4;
    const totalModules = matrix.size + margin * 2;
    const captionText = caption.trim();
    const captionHeight = captionText ? Math.round(sizePx * 0.12) : 0;

    canvas.width = sizePx;
    canvas.height = sizePx + captionHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background
    ctx.fillStyle = selectedColor.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Modules
    const scale = sizePx / totalModules;
    ctx.fillStyle = selectedColor.fg;
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        if (matrix.modules[y][x]) {
          const rx = Math.floor((x + margin) * scale);
          const ry = Math.floor((y + margin) * scale);
          const rw = Math.ceil((x + margin + 1) * scale) - rx;
          const rh = Math.ceil((y + margin + 1) * scale) - ry;
          ctx.fillRect(rx, ry, rw, rh);
        }
      }
    }

    // Center Logo overlay
    if (logoImg) {
      const qrDrawArea = matrix.size * scale;
      const logoMaxSide = Math.round(qrDrawArea * logoScale);
      const pad = Math.max(4, Math.round(logoMaxSide * 0.14));
      const boxSize = logoMaxSide + pad * 2;
      const boxX = Math.round((sizePx - boxSize) / 2);
      const boxY = Math.round((sizePx - boxSize) / 2);
      const radius = Math.round(boxSize * 0.18);

      // Draw clean background cushion behind logo
      ctx.save();
      drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, radius);
      ctx.fillStyle = selectedColor.bg;
      ctx.fill();
      ctx.lineWidth = Math.max(1, Math.round(sizePx * 0.003));
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.stroke();
      ctx.restore();

      // Preserve logo aspect ratio inside logoMaxSide x logoMaxSide
      const imgW = logoImg.naturalWidth || logoImg.width || 1;
      const imgH = logoImg.naturalHeight || logoImg.height || 1;
      const ratio = Math.min(logoMaxSide / imgW, logoMaxSide / imgH);
      const drawW = Math.round(imgW * ratio);
      const drawH = Math.round(imgH * ratio);
      const drawX = Math.round((sizePx - drawW) / 2);
      const drawY = Math.round((sizePx - drawH) / 2);

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(logoImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    // Optional caption
    if (captionText) {
      const fontSize = Math.max(14, Math.round(sizePx * 0.042));
      ctx.font = `600 ${fontSize}px "Anuphan", "Noto Sans Thai", sans-serif`;
      ctx.fillStyle = selectedColor.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(captionText, sizePx / 2, sizePx + captionHeight / 2 - 4, sizePx - 32);
    }

    return canvas;
  }, [qrResult.matrix, sizePx, selectedColor, caption, logoImg, logoScale]);

  useEffect(() => {
    renderToCanvas();
  }, [renderToCanvas]);

  const handleDownloadPng = () => {
    const canvas = renderToCanvas();
    if (!canvas || !qrResult.matrix) return;
    const hadLogo = Boolean(logoDataUrl);
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qrcode-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clear canvas & in-memory logo cache immediately if enabled
    if (hadLogo && autoClearLogo) {
      clearLogoCache(true);
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      toast.success('ดาวน์โหลด QR Code (.png) และล้างแคชรูปโลโก้ออกเรียบร้อยแล้ว');
    } else {
      toast.success('ดาวน์โหลดไฟล์ QR Code (.png) เรียบร้อยแล้ว');
    }
  };

  const handleDownloadSvg = () => {
    if (!qrResult.svg) return;
    const hadLogo = Boolean(logoDataUrl);
    const blob = new Blob([qrResult.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qrcode-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (hadLogo && autoClearLogo) {
      clearLogoCache(true);
      toast.success('ดาวน์โหลด QR Code (.svg) และล้างแคชรูปโลโก้ออกเรียบร้อยแล้ว');
    } else {
      toast.success('ดาวน์โหลดไฟล์ QR Code (.svg) เรียบร้อยแล้ว');
    }
  };

  const handleCopyImage = async () => {
    const canvas = renderToCanvas();
    if (!canvas || !qrResult.matrix) return;
    const hadLogo = Boolean(logoDataUrl);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob || !navigator.clipboard?.write) {
        throw new Error('เบราว์เซอร์ไม่รองรับการคัดลอกรูปภาพโดยตรง');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      if (hadLogo && autoClearLogo) {
        clearLogoCache(true);
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        toast.success('คัดลอกรูปภาพ QR Code และล้างแคชรูปโลโก้ออกเรียบร้อยแล้ว');
      } else {
        toast.success('คัดลอกรูปภาพ QR Code ลงคลิปบอร์ดแล้ว');
      }
    } catch {
      toast.error('ไม่สามารถคัดลอกรูปภาพได้ กรุณากดดาวน์โหลดไฟล์ PNG แทน');
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="QR Code Generate"
        subtitle="สร้าง QR Code สำหรับลิงก์ ข้อความภาษาไทย/อังกฤษ หรือ Wi-Fi พร้อมใส่โลโก้ตรงกลางแบบออฟไลน์ 100%"
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Input & Settings */}
        <div className="space-y-6 lg:col-span-7">
          {/* Mode & Content Card */}
          <section className="ios-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold text-sm text-ios-primary flex items-center gap-2">
                <QrCode className="h-4 w-4 text-accent" aria-hidden />
                ประเภทข้อมูลที่ต้องการสร้าง
              </h2>
              <SegmentedControl
                value={mode}
                onChange={(v) => setMode(v as QrMode)}
                options={[
                  { value: 'text', label: 'ลิงก์ / ข้อความ', icon: <Link2 className="h-3.5 w-3.5" /> },
                  { value: 'wifi', label: 'Wi-Fi', icon: <Wifi className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>

            {mode === 'text' ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor="qr-text-input" className="block text-xs font-semibold text-ios-secondary mb-1.5">
                    URL เว็บไซต์ หรือข้อความที่ต้องการแปลงเป็น QR Code
                  </label>
                  <textarea
                    id="qr-text-input"
                    rows={4}
                    className="ios-input w-full resize-y font-sans text-sm"
                    placeholder="วางลิงก์ https://... หรือพิมพ์ข้อความภาษาไทย/อังกฤษที่นี่..."
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                  />
                </div>

                {/* Quick Fill Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ios-secondary">ทางลัด:</span>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setTextValue(window.location.origin)}
                  >
                    <Globe className="h-3.5 w-3.5" aria-hidden /> ลิงก์หน้าแอปปัจจุบัน
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setTextValue('');
                      setCaption('');
                      if (logoDataUrl) clearLogoCache(true);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> ล้างค่าทั้งหมด
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label htmlFor="wifi-ssid" className="block text-xs font-semibold text-ios-secondary mb-1.5">
                    ชื่อเครือข่าย Wi-Fi (SSID) <span className="text-status-overdue">*</span>
                  </label>
                  <input
                    id="wifi-ssid"
                    type="text"
                    className="ios-input w-full"
                    placeholder="เช่น Office_WiFi_5G"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="wifi-auth" className="block text-xs font-semibold text-ios-secondary mb-1.5">
                      การเข้ารหัสความปลอดภัย
                    </label>
                    <select
                      id="wifi-auth"
                      className="ios-input w-full"
                      value={wifiAuth}
                      onChange={(e) => setWifiAuth(e.target.value as 'WPA' | 'WEP' | 'nopass')}
                    >
                      <option value="WPA">WPA / WPA2 / WPA3</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">ไม่มีรหัสผ่าน (Open)</option>
                    </select>
                  </div>

                  {wifiAuth !== 'nopass' && (
                    <div>
                      <label htmlFor="wifi-pass" className="block text-xs font-semibold text-ios-secondary mb-1.5">
                        รหัสผ่าน Wi-Fi
                      </label>
                      <input
                        id="wifi-pass"
                        type="text"
                        className="ios-input w-full"
                        placeholder="กรอกรหัสผ่าน Wi-Fi"
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-ios-secondary cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    className="accent-accent rounded"
                    checked={wifiHidden}
                    onChange={(e) => setWifiHidden(e.target.checked)}
                  />
                  <span>เครือข่ายที่ซ่อนชื่อ (Hidden SSID)</span>
                </label>
              </div>
            )}
          </section>

          {/* Center Logo Upload Card (Memory-only, Auto-clear cache) */}
          <section className="ios-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-sm text-ios-primary flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-accent" aria-hidden />
                  โลโก้ตรงกลาง QR Code (ไม่บังคับ)
                </h2>
                <p className="text-xs text-ios-secondary mt-0.5">
                  ประมวลผลในหน่วยความจำชั่วคราวเท่านั้น ไม่บันทึกภาพลงฐานข้อมูลหรือในเครื่อง
                </p>
              </div>

              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoFileChange}
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                  {logoDataUrl ? 'เปลี่ยนรูปโลโก้' : 'เลือกรูปโลโก้'}
                </button>
                {logoDataUrl && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-status-overdue"
                    onClick={() => clearLogoCache(false)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> ล้างแคชโลโก้
                  </button>
                )}
              </div>
            </div>

            {logoDataUrl && (
              <div className="rounded-ios-control border border-ios-separator/20 bg-ios-bg p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={logoDataUrl}
                      alt="ตัวอย่างโลโก้"
                      className="h-10 w-10 rounded-lg border border-ios-separator/30 bg-white object-contain p-1 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ios-primary truncate">{logoName}</p>
                      <p className="text-[11px] text-status-done flex items-center gap-1 mt-0.5">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        อยู่ในหน่วยความจำชั่วคราว (RAM)
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ios-secondary mb-1.5">ขนาดโลโก้ตรงกลาง</p>
                  <SegmentedControl
                    value={logoScale.toFixed(2)}
                    onChange={(v) => setLogoScale(Number(v))}
                    options={LOGO_SCALE_OPTIONS}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            <label className="flex items-start gap-2.5 text-xs text-ios-secondary cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-accent rounded"
                checked={autoClearLogo}
                onChange={(e) => setAutoClearLogo(e.target.checked)}
              />
              <span>
                <strong className="text-ios-primary font-semibold">
                  ล้างแคชรูปโลโก้อัตโนมัติทันทีหลังดาวน์โหลดหรือคัดลอกเสร็จ
                </strong>
                <span className="block text-[11px] text-ios-secondary mt-0.5">
                  เมื่อกดดาวน์โหลด PNG / SVG หรือคัดลอกรูปภาพ ระบบจะเคลียร์ข้อมูลภาพออกจากหน่วยความจำทันทีโดยไม่เก็บตกค้าง
                </span>
              </span>
            </label>
          </section>

          {/* Customization Card */}
          <section className="ios-card p-5 space-y-4">
            <h2 className="font-bold text-sm text-ios-primary flex items-center gap-2">
              <Palette className="h-4 w-4 text-accent" aria-hidden />
              ปรับแต่งรูปแบบ QR Code
            </h2>

            {/* Caption */}
            <div>
              <label htmlFor="qr-caption" className="block text-xs font-semibold text-ios-secondary mb-1.5 flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-accent" aria-hidden />
                ข้อความกำกับใต้ภาพ (เมื่อดาวน์โหลด PNG - ไม่บังคับ)
              </label>
              <input
                id="qr-caption"
                type="text"
                maxLength={60}
                className="ios-input w-full"
                placeholder="เช่น สแกนเพื่อเปิดลิงก์ หรือ ชื่อเอกสาร..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>

            {/* Color Presets */}
            <div>
              <p className="text-xs font-semibold text-ios-secondary mb-2">โทนสี QR Code</p>
              <div className="flex flex-wrap gap-2.5">
                {COLOR_PRESETS.map((preset) => {
                  const active = preset.id === colorPresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setColorPresetId(preset.id)}
                      className={`flex items-center gap-2 rounded-ios-control border px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'border-accent bg-accent/10 text-ios-primary shadow-sm'
                          : 'border-ios-separator/20 bg-ios-bg text-ios-secondary hover:border-accent/40'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: preset.fg }}
                      />
                      <span>{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size & Error Correction */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-ios-secondary mb-1.5">ขนาดไฟล์ภาพ (PNG)</p>
                <SegmentedControl
                  value={String(sizePx)}
                  onChange={(v) => setSizePx(Number(v))}
                  options={SIZE_OPTIONS}
                  className="w-full"
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-ios-secondary mb-1.5 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
                  ระดับการกู้คืนข้อมูล (Error Correction)
                </p>
                <SegmentedControl
                  value={ecc}
                  onChange={(v) => setEcc(v as QrEccLevel)}
                  options={ECC_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  className="w-full"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Live Preview & Download */}
        <div className="space-y-4 lg:col-span-5">
          <section className="ios-card p-5 flex flex-col items-center text-center space-y-4">
            <div className="w-full flex items-center justify-between text-xs text-ios-secondary">
              <span className="font-bold uppercase tracking-wider">ตัวอย่าง QR Code</span>
              {qrResult.matrix && (
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 font-semibold text-accent">
                  Version {qrResult.matrix.version} ({qrResult.matrix.size}×{qrResult.matrix.size}) · ECC {ecc}
                </span>
              )}
            </div>

            {/* Preview Container */}
            <div className="flex min-h-[260px] w-full max-w-[280px] flex-col items-center justify-center rounded-2xl border border-ios-separator/30 bg-white p-4 shadow-sm">
              {!payload ? (
                <div className="space-y-2 py-8 text-slate-400">
                  <QrCode className="mx-auto h-12 w-12 opacity-40" strokeWidth={1.5} />
                  <p className="text-xs">กรอกข้อความหรือลิงก์เพื่อสร้าง QR Code</p>
                </div>
              ) : qrResult.error ? (
                <p className="text-xs font-medium text-status-overdue px-2">{qrResult.error}</p>
              ) : (
                <>
                  <div
                    className="w-full aspect-square"
                    dangerouslySetInnerHTML={{ __html: qrResult.svg }}
                  />
                  {caption.trim() && (
                    <p
                      className="mt-1.5 text-xs font-semibold truncate max-w-full px-2"
                      style={{ color: selectedColor.fg }}
                    >
                      {caption.trim()}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Hidden Canvas for High-Res PNG Export */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Action Buttons */}
            <div className="w-full space-y-2 pt-1">
              <button
                type="button"
                className="btn-primary w-full justify-center py-2.5"
                onClick={handleDownloadPng}
                disabled={!qrResult.matrix}
              >
                <Download className="h-4 w-4" aria-hidden />
                ดาวน์โหลดรูปภาพ PNG ({sizePx} px)
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-secondary justify-center"
                  onClick={handleCopyImage}
                  disabled={!qrResult.matrix}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-status-done" aria-hidden /> คัดลอกแล้ว
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden /> คัดลอกรูปภาพ
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn-secondary justify-center"
                  onClick={handleDownloadSvg}
                  disabled={!qrResult.matrix}
                >
                  <FileCode2 className="h-4 w-4" aria-hidden /> ดาวน์โหลด SVG
                </button>
              </div>
            </div>

            {/* Lifetime Info Badge */}
            <div className="w-full rounded-ios-control border border-ios-separator/20 bg-ios-bg p-3 text-left text-xs text-ios-secondary space-y-1">
              <p className="font-semibold text-ios-primary flex items-center gap-1.5">
                <InfinityIcon className="h-4 w-4 text-status-done shrink-0" aria-hidden />
                ใช้งานได้ถาวร ไม่มีวันหมดอายุ (Static QR Code)
              </p>
              <p className="leading-relaxed text-[11px]">
                QR Code ที่สร้างจากหน้านี้ถูกเข้ารหัสตามมาตรฐาน ISO/IEC 18004 แบบออฟไลน์ 100% และหากใส่รูปโลโก้ ระบบจะฝังลงในไฟล์ภาพที่ดาวน์โหลดแล้วล้างแคชรูปออกจากหน่วยความจำทันที
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
