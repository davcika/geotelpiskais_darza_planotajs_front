import { AfterViewInit, Component, OnInit, ElementRef, input, output, viewChild } from '@angular/core';
import { FrostCard } from './frost-card';
import { zoneCenterLatLon } from './frost-logic';
import { GardenDto } from './garden-store';

/** Salnu datumu dialogs no dārza izvēlnes */
@Component({
  selector: 'app-frost-dialog',
  imports: [FrostCard],
  styleUrl: './dialog.scss',
  template: `
    <dialog #dialog aria-labelledby="frost-title" (cancel)="onCancel($event)">
      <app-frost-card [gardenId]="garden().id" [point]="point" [initial]="garden().frost ?? null" skipLabel="Close" (done)="close()" />
    </dialog>
  `,
})
export class FrostDialog implements OnInit, AfterViewInit {
  readonly garden = input.required<GardenDto>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected point: [number, number] | null = null;

  ngOnInit(): void {
    // Ja datumi jau ir, rāda tos, citādi rēķina zonas centram
    const g = this.garden();
    this.point = g.frost?.lastFrost ? null : zoneCenterLatLon(g.hubGeometry);
  }

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
    this.closed.emit();
  }
}
