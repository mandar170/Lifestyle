// Verifies the barcode scanner's progressive-enhancement fallback chain:
//   native BarcodeDetector  ->  ZXing  ->  manual entry.
// The camera itself can't run headless, so we stub window.BarcodeDetector /
// navigator.mediaDevices / window.ZXingBrowser to drive each branch and assert
// the resulting behavior. This guards the decision tree, not the decode.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();

  const out = await page.evaluate(async () => {
    const res = {};

    // navigator.mediaDevices / its getUserMedia are read-only, so stub via defineProperty.
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
    const setGetUserMedia = (fn) => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, writable: true, value: fn });
    HTMLMediaElement.prototype.play = async function () {};
    // A real <video>.srcObject setter rejects a plain fake stream; neutralise it.
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, set() {}, get() { return null; } });

    // Capture what lookupBarcode receives, and neutralise its side effects.
    let looked = null;
    window.lookupBarcode = (code) => { looked = code; };
    const manualShown = () => document.getElementById('bc-manual-view').style.display === 'block';

    // Fake MediaStream whose track records that stop() was called.
    function fakeStream() {
      const track = { stopped: false, stop() { this.stopped = true; } };
      return { _track: track, getTracks: () => [track] };
    }

    // ---- Case A: native available & detects a code ----
    window.__lastStream = null;
    window.BarcodeDetector = function () { this.detect = async () => [{ rawValue: '3017620422003' }]; };
    window.BarcodeDetector.getSupportedFormats = async () => ['ean_13', 'ean_8'];
    setGetUserMedia(async () => { const s = fakeStream(); window.__lastStream = s; return s; });
    looked = null;
    await window.startBarcodeScan();
    await new Promise(r => setTimeout(r, 350)); // let one detect tick run
    res.nativeDetected = looked;                                   // '3017620422003'
    res.nativeStreamStopped = !!(window.__lastStream && window.__lastStream._track.stopped); // true

    // ---- Case B: native present but camera denied -> falls back to ZXing ----
    let zxingUsed = false;
    window.BarcodeDetector = function () { this.detect = async () => []; };
    window.BarcodeDetector.getSupportedFormats = async () => ['ean_13'];
    setGetUserMedia(async () => { throw new Error('NotAllowedError'); });
    window.ZXingBrowser = {
      BrowserMultiFormatReader: function () {
        this.decodeFromVideoDevice = async () => { zxingUsed = true; return { stop() {} }; };
      },
    };
    await window.startBarcodeScan();
    await new Promise(r => setTimeout(r, 50));
    res.fellBackToZxing = zxingUsed;                      // true

    // ---- Case C: neither native nor ZXing -> manual entry ----
    delete window.BarcodeDetector;
    window.ZXingBrowser = undefined;
    document.getElementById('bc-manual-view').style.display = 'none';
    await window.startBarcodeScan();
    await new Promise(r => setTimeout(r, 30));
    res.manualShownWhenNothing = manualShown();           // true

    return res;
  });

  t.eq('native path detects and forwards the code', out.nativeDetected, '3017620422003');
  t.ok('native path stops the camera stream after a hit', out.nativeStreamStopped);
  t.ok('camera failure falls back to ZXing', out.fellBackToZxing);
  t.ok('no API at all falls back to manual entry', out.manualShownWhenNothing);
  return t.results;
}

module.exports = { run };
