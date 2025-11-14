class ResponsiveScaler {
  constructor() {
    this.frame = document.querySelector('.frame');
    this.originalWidth = 4000;
    this.originalHeight = 2251;
    if (this.frame) {
      this.frame.style.position = 'absolute';
    }
    this.updateScale();
    window.addEventListener('resize', () => this.updateScale());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.updateScale(), 100);
    });
  }

  updateScale() {
    if (!this.frame) return;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const scaleX = viewportWidth / this.originalWidth;
    const scaleY = viewportHeight / this.originalHeight;
    const scale = Math.min(scaleX, scaleY);
    
    const scaledWidth = this.originalWidth * scale;
    const scaledHeight = this.originalHeight * scale;
    
    const offsetX = (viewportWidth - scaledWidth) / 2;
    const offsetY = (viewportHeight - scaledHeight) / 2;
    
    this.frame.style.transform = `scale(${scale})`;
    this.frame.style.transformOrigin = '0 0';
    this.frame.style.left = `${offsetX}px`;
    this.frame.style.top = `${offsetY}px`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ResponsiveScaler();
  });
} else {
  new ResponsiveScaler();
}

