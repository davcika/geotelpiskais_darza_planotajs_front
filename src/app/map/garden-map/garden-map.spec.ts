import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { GardenMap } from './garden-map';

// Testu vidē nav ResizeObserver, bet karte to vajag jau no paša sākuma
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

describe('GardenMap', () => {
  let component: GardenMap;
  let fixture: ComponentFixture<GardenMap>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GardenMap],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GardenMap);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
