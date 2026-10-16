import { useEffect, useRef } from 'react';
import SignaturePad from 'signature_pad';

// 指でサインしてもらう欄。サインが変わるたびに PNG の dataURL（未記入なら ''）を返す。
export default function SignatureBox({ onChange, label = 'こちらにサインしてください' }: { onChange: (dataUrl: string) => void; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const pad = new SignaturePad(canvas, { penColor: '#111', minWidth: 1, maxWidth: 3, backgroundColor: 'rgba(0,0,0,0)' });
    padRef.current = pad;

    const resize = () => {
      const data = pad.toData();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')!.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    };
    resize();
    window.addEventListener('resize', resize);
    pad.addEventListener('endStroke', () => onChange(pad.isEmpty() ? '' : pad.toDataURL('image/png')));
    return () => {
      window.removeEventListener('resize', resize);
      pad.off();
    };
  }, []);

  const clear = () => {
    padRef.current?.clear();
    onChange('');
  };

  return (
    <div className="sig-wrap">
      <canvas ref={canvasRef} />
      <div className="hint">{label}</div>
      <button type="button" className="small clear" onClick={clear}>
        書き直す
      </button>
    </div>
  );
}
