import readline from 'node:readline';

type SpinnerStyle = 'dots' | 'lines' | 'stars' | 'arrows';

export class Spinner {
  private interval: NodeJS.Timeout | null = null;
  private styles = {
    dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    lines: ['-', '\\', '|', '/'],
    stars: ['✶', '✸', '✹', '✺', '✹', '✷'],
    arrows: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙']
  };
  private currentFrame = 0;
  private text = '';
  private speed = 80;
  private style: SpinnerStyle = 'dots';
  
  constructor(opts?: {style?: SpinnerStyle; speed?: number}) {
    if (opts?.style) this.style = opts.style;
    if (opts?.speed) this.speed = opts.speed;
  }
  
  start(text: string, style?: SpinnerStyle) {
    if (style) this.style = style;
    this.text = text;
    process.stdout.write('\x1B[?25l'); // Hide cursor
    this.interval = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.styles[this.style].length;
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`\x1B[36m${this.styles[this.style][this.currentFrame]}\x1B[0m ${this.text}`);
    }, this.speed);
  }
  
  stop(success = true) {
    if (this.interval) {
      clearInterval(this.interval);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 1);
      if (success) {
        process.stdout.write('\x1B[32m✓\x1B[0m ' + this.text + '\n');
      } else {
        process.stdout.write('\x1B[31m✗\x1B[0m ' + this.text + '\n');
      }
      process.stdout.write('\x1B[?25h'); // Show cursor
    }
  }
  
  update(text: string) {
    this.text = text;
  }
}
