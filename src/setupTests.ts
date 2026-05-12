// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';

// Mock matchmedia
window.matchMedia = window.matchMedia || function() {
  return {
      matches: false,
      addListener: function() {},
      removeListener: function() {}
  };
};

if (typeof window.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

(HTMLCanvasElement.prototype as any).getContext = function getContext() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    beginPath() {},
    closePath() {},
    rect() {},
    fillRect() {},
    clearRect() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    clip() {},
    drawImage() {},
    fillText() {},
    strokeText() {},
    measureText(text: string) {
      return { width: (text?.length ?? 0) * 8 } as TextMetrics;
    },
  } as unknown as CanvasRenderingContext2D;
};

(HTMLCanvasElement.prototype as any).toDataURL = () => 'data:image/png;base64,mock';
