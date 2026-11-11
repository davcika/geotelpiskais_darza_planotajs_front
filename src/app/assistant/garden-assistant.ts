import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { GardenStore } from '../garden/garden-store';
import { problemDetail } from '../shared/format';
import { TipComponent } from '../tour/tip.component';
import { MarkdownPipe } from './markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = ['What can I sow this week?', 'What grows well next to tomatoes?', 'Plan crop rotation for next year'];

/** Sarunu glabājam tikai šeit, bet backend pieliek dārza datus un prasa Groq modelim */
@Component({
  selector: 'app-garden-assistant',
  imports: [FormsModule, TipComponent, MarkdownPipe],
  templateUrl: './garden-assistant.html',
  styleUrl: './garden-assistant.scss',
})
export class GardenAssistant {
  private readonly http = inject(HttpClient);
  private readonly gardens = inject(GardenStore);

  readonly year = input.required<number>();

  protected readonly suggestions = SUGGESTIONS;
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected draft = '';
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  /** Aug ar katru Clear, lai vēlu atnākusi veca atbilde netiek ierakstīta */
  private seq = 0;

  constructor() {
    const auth = inject(AuthService);
    // Pēc izlogošanās nākamais lietotājs nedrīkst redzēt sarunu
    effect(() => {
      if (!auth.token()) this.clear();
    });
  }

  protected send(text = this.draft): void {
    const question = text.trim();
    if (!question || this.busy()) return;
    // Backend pieņem ne vairāk par 20 ziņām
    const history = [...this.messages(), { role: 'user' as const, content: question.slice(0, 2000) }].slice(-20);
    this.messages.set(history);
    this.draft = '';
    this.busy.set(true);
    this.error.set(null);
    this.scrollDown();
    const seq = this.seq;

    this.gardens
      .fetch()
      .pipe(
        switchMap((garden) =>
          this.http.post<{ answer: string }>(`/api/gardens/${garden.id}/assistant`, {
            messages: history,
            year: this.year(),
          }),
        ),
      )
      .subscribe({
        next: ({ answer }) => {
          if (seq !== this.seq) return;
          this.messages.update((list) => [...list, { role: 'assistant', content: answer }]);
          this.busy.set(false);
          this.scrollDown();
        },
        error: (error) => {
          if (seq !== this.seq) return;
          // Jautājumu liekam atpakaļ laukā, lai to var sūtīt vēlreiz
          this.messages.update((list) => list.slice(0, -1));
          this.draft = question;
          this.error.set(problemDetail(error, 'The assistant is unavailable. Try again.'));
          this.busy.set(false);
        },
      });
  }

  protected clear(): void {
    this.seq++;
    this.busy.set(false);
    this.messages.set([]);
    this.error.set(null);
  }

  private scrollDown(): void {
    setTimeout(() => {
      const el = this.log()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
