import { useEffect, useState } from 'react';
import { Download, PlusSquare, Share, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'sportygo-install-prompt-dismissed';

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function isIosSafari() {
  const userAgent = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
  return isIos && isSafari;
}

export default function InstallAppPrompt() {
  const { state } = useApp();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  useEffect(() => {
    if (isStandalone()) return;

    const iosSafari = isIosSafari();
    setIsIos(iosSafari);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      if (!dismissed) setShowPrompt(true);
    };
    const handleInstalled = () => {
      setShowPrompt(false);
      setShowIosGuide(false);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    let iosPromptTimer: number | undefined;
    if (iosSafari && !dismissed) {
      iosPromptTimer = window.setTimeout(() => setShowPrompt(true), 1200);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      if (iosPromptTimer) window.clearTimeout(iosPromptTimer);
    };
  }, [dismissed]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
    setShowPrompt(false);
    setShowIosGuide(false);
  };

  const install = async () => {
    if (isIos) {
      setShowPrompt(false);
      setShowIosGuide(true);
      return;
    }

    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setShowPrompt(false);
    setInstallEvent(null);
  };

  if (showIosGuide) {
    return (
      <div className="install-guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
        <div className="install-guide">
          <button className="install-prompt-close" type="button" onClick={dismiss} aria-label="Close installation instructions">
            <X size={20} aria-hidden="true" />
          </button>
          <img className="install-guide-icon" src="/apple-touch-icon.png?v=2" alt="" />
          <h2 id="install-guide-title">Add SportyGo to your Home Screen</h2>
          <ol className="install-guide-steps">
            <li><span><Share size={20} aria-hidden="true" /></span><p>Tap the <strong>Share</strong> button in Safari.</p></li>
            <li><span><PlusSquare size={20} aria-hidden="true" /></span><p>Choose <strong>Add to Home Screen</strong>.</p></li>
            <li><span className="install-guide-add">Add</span><p>Tap <strong>Add</strong> in the top-right corner.</p></li>
          </ol>
          <button className="install-guide-done" type="button" onClick={dismiss}>Got it</button>
        </div>
      </div>
    );
  }

  if (!showPrompt) {
    const showInstallShortcut = dismissed && state.screen === 'home' && (isIos || installEvent !== null);
    if (!showInstallShortcut) return null;

    return (
      <button
        className="install-shortcut"
        type="button"
        onClick={() => void install()}
        aria-label="Install SportyGo"
        title="Install SportyGo"
      >
        <Download size={21} aria-hidden="true" />
      </button>
    );
  }

  return (
    <aside className="install-prompt" aria-label="Install SportyGo">
      <img className="install-prompt-icon" src="/apple-touch-icon.png?v=2" alt="" />
      <div className="install-prompt-copy">
        <strong>Install SportyGo</strong>
        <span>Book sports faster from your Home Screen.</span>
      </div>
      <button className="install-prompt-action" type="button" onClick={() => void install()}>
        <Download size={17} aria-hidden="true" />
        Install
      </button>
      <button className="install-prompt-close" type="button" onClick={dismiss} aria-label="Dismiss install prompt">
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}