import type { Site } from "@/lib/sites/schema";
import { benchmarks } from "./benchmarks";
import type { Concept, OwnerBrief, SeatFit } from "./types";

/**
 * Seats the space fits = floor(area x dining share / SF per seat for the concept).
 * Area is the Matterport scan area when the scan is of the exact suite, otherwise the CoStar listing SF.
 *
 * `seats` is always what the space fits. Break-even and FF&E use the seats the owner will operate
 * (see operatedSeats); pass `wantedSeats` so the basis names both numbers.
 */
export function fitSeats(site: Site, concept: Concept, wantedSeats?: number): SeatFit {
  const scan = site.matterport;
  const scanSf = scan?.scanOfExactSuite && scan.areaSf ? scan.areaSf : null;
  const areaSf = scanSf ?? site.space.sf;
  const share = benchmarks.diningAreaShare.value;
  const perSeat = benchmarks.sfPerSeat[concept];
  const seats = Math.floor((areaSf * share) / perSeat.mid);
  const areaSource = scanSf ? "Matterport scan" : "CoStar listing";

  let used: string;
  if (wantedSeats === undefined) used = `break-even uses all ${seats}`;
  else if (wantedSeats <= seats) used = `break-even uses the ${wantedSeats} seats you want`;
  else used = `break-even uses all ${seats}, fewer than the ${wantedSeats} you want`;

  return {
    seats,
    basis: `Fits ${seats} seats: ${Math.round(areaSf).toLocaleString("en-US")} SF (${areaSource}) x ${
      share * 100
    }% dining area (${benchmarks.diningAreaShare.source.label}) / ${perSeat.mid} SF per ${concept} seat (${
      perSeat.source.label
    }); ${used}`,
  };
}

/** Seats the owner will actually run: the smaller of what they want and what fits; all that fit when no number is given. */
export function operatedSeats(fit: SeatFit, brief: OwnerBrief): number {
  return brief.seats === undefined ? fit.seats : Math.min(fit.seats, brief.seats);
}
