import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

/** Starpposms dārza maiņai, lai karte un viss pārējais ielādētos no jauna */
@Component({ selector: 'app-garden-switch-page', template: '' })
export class GardenSwitchPage implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.router.navigate(['/'], { replaceUrl: true });
  }
}
