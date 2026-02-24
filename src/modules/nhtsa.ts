/**
 * NHTSA module — vehicle recalls, safety complaints, and VIN decoding
 */

import { z } from "zod";
import type { Tool } from "fastmcp";
import {
  getRecalls,
  getComplaints,
  decodeVin,
  getModelsForMake,
  getSafetyRatingVehicles,
  getSafetyRatingDetail,
  clearCache as sdkClearCache,
  type Recall,
  type Complaint,
} from "../sdk/nhtsa.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "nhtsa";
export const displayName = "NHTSA";
export const description =
  "National Highway Traffic Safety Administration — vehicle recalls, consumer complaints, VIN decoding, vehicle specifications. No API key required.";
export const workflow =
  "Use nhtsa_recalls to search for recalls by make/model/year → nhtsa_complaints for consumer complaints → nhtsa_decode_vin to decode a specific VIN → nhtsa_models to browse available models for a make.";
export const tips =
  "Use common make names like 'honda', 'toyota', 'ford', 'chevrolet', 'tesla'. Model names should match official names: 'civic', 'camry', 'f-150', 'model 3'. VINs are 17 characters.";

// ─── Helpers ─────────────────────────────────────────────────────────

function summarizeRecalls(data: Recall[]): string {
  if (!data.length) return "No recalls found for this vehicle.";
  const lines = data.map((r) => {
    const parts = [
      `Campaign: ${r.NHTSACampaignNumber ?? "?"}`,
      `${r.ModelYear ?? "?"} ${r.Make ?? "?"} ${r.Model ?? "?"}`,
      `Component: ${r.Component ?? "?"}`,
      `Summary: ${r.Summary ?? "N/A"}`,
      `Consequence: ${r.Consequence ?? "N/A"}`,
      `Remedy: ${r.Remedy ?? "N/A"}`,
    ];
    if (r.parkIt) parts.push("⚠ PARK IT: Do not drive");
    return parts.join("\n  ");
  });
  return `${data.length} recall(s) found:\n\n${lines.join("\n\n")}`;
}

function summarizeComplaints(data: Complaint[]): string {
  if (!data.length) return "No complaints found for this vehicle.";
  const stats = {
    total: data.length,
    crashes: data.filter((c) => c.crash).length,
    fires: data.filter((c) => c.fire).length,
    injuries: data.reduce((sum, c) => sum + (c.numberOfInjuries ?? 0), 0),
    deaths: data.reduce((sum, c) => sum + (c.numberOfDeaths ?? 0), 0),
  };
  const header = `${stats.total} complaint(s) — ${stats.crashes} crash(es), ${stats.fires} fire(s), ${stats.injuries} injury(ies), ${stats.deaths} death(s)`;

  const preview = data.slice(0, 10);
  const lines = preview.map((c) => {
    const date = c.dateOfIncident ?? c.dateComplaintFiled ?? "?";
    const product = c.products?.[0];
    const vehicle = product ? `${product.productYear ?? ""} ${product.productMake ?? ""} ${product.productModel ?? ""}`.trim() : "?";
    return `[${c.odiNumber ?? "?"}] ${date} — ${vehicle}\n  Component: ${c.components ?? "?"}\n  ${c.summary ?? "No summary"}${c.crash ? "\n  ⚠ CRASH" : ""}${c.fire ? "\n  🔥 FIRE" : ""}`;
  });

  return `${header}\n\n${lines.join("\n\n")}${data.length > 10 ? `\n\n... and ${data.length - 10} more` : ""}`;
}

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "nhtsa_recalls",
    description:
      "Search NHTSA vehicle recalls by make, model, and model year. Returns campaign numbers, affected components, consequences, and remedies.",
    annotations: { title: "NHTSA Vehicle Recalls", readOnlyHint: true },
    parameters: z.object({
      make: z.string().describe("Vehicle make (e.g. 'honda', 'toyota', 'ford', 'tesla')"),
      model: z.string().describe("Vehicle model (e.g. 'civic', 'camry', 'f-150', 'model 3')"),
      model_year: z.number().describe("Model year (e.g. 2020, 2023)"),
    }),
    execute: async (args) => {
      const data = await getRecalls({
        make: args.make,
        model: args.model,
        modelYear: args.model_year,
      });
      return { content: [{ type: "text" as const, text: summarizeRecalls(data) }] };
    },
  },
  {
    name: "nhtsa_complaints",
    description:
      "Search NHTSA consumer complaints about vehicles. Shows crash/fire/injury/death counts, affected components, and complaint summaries.",
    annotations: { title: "NHTSA Vehicle Complaints", readOnlyHint: true },
    parameters: z.object({
      make: z.string().describe("Vehicle make (e.g. 'honda', 'toyota', 'ford', 'tesla')"),
      model: z.string().describe("Vehicle model (e.g. 'civic', 'camry', 'f-150', 'model 3')"),
      model_year: z.number().describe("Model year (e.g. 2020, 2023)"),
    }),
    execute: async (args) => {
      const data = await getComplaints({
        make: args.make,
        model: args.model,
        modelYear: args.model_year,
      });
      return { content: [{ type: "text" as const, text: summarizeComplaints(data) }] };
    },
  },
  {
    name: "nhtsa_decode_vin",
    description:
      "Decode a Vehicle Identification Number (VIN) to get vehicle specifications: make, model, year, engine, body class, drive type, fuel type, manufacturer, plant location.",
    annotations: { title: "NHTSA VIN Decoder", readOnlyHint: true },
    parameters: z.object({
      vin: z.string().min(11).max(17).describe("Vehicle Identification Number (VIN), 11-17 characters"),
    }),
    execute: async (args) => {
      const result = await decodeVin(args.vin);
      if (result.ErrorCode && result.ErrorCode !== "0") {
        return { content: [{ type: "text" as const, text: `VIN decode error: ${result.ErrorText ?? "Unknown error"}` }] };
      }
      const fields = [
        ["Make", result.Make],
        ["Model", result.Model],
        ["Year", result.ModelYear],
        ["Manufacturer", result.Manufacturer],
        ["Vehicle Type", result.VehicleType],
        ["Body Class", result.BodyClass],
        ["Drive Type", result.DriveType],
        ["Fuel Type", result.FuelTypePrimary],
        ["Engine", result.EngineModel],
        ["Cylinders", result.EngineCylinders],
        ["Displacement (L)", result.DisplacementL],
        ["Transmission", result.TransmissionStyle],
        ["Plant City", result.PlantCity],
        ["Plant Country", result.PlantCountry],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`);

      return { content: [{ type: "text" as const, text: fields.join("\n") || "No data returned for this VIN." }] };
    },
  },
  {
    name: "nhtsa_models",
    description:
      "Get all models available for a given vehicle make, optionally filtered by model year. Useful for discovering valid model names before searching recalls/complaints.",
    annotations: { title: "NHTSA Vehicle Models", readOnlyHint: true },
    parameters: z.object({
      make: z.string().describe("Vehicle make (e.g. 'honda', 'toyota', 'ford')"),
      model_year: z.number().optional().describe("Optional model year filter"),
    }),
    execute: async (args) => {
      const data = await getModelsForMake({
        make: args.make,
        modelYear: args.model_year,
      });
      if (!data.length) return { content: [{ type: "text" as const, text: `No models found for make '${args.make}'.` }] };
      const models = data.map((m) => m.Model_Name).sort();
      return {
        content: [{ type: "text" as const, text: `${models.length} model(s) for ${args.make}${args.model_year ? ` (${args.model_year})` : ""}:\n${models.join(", ")}` }],
      };
    },
  },

  {
    name: "nhtsa_safety_ratings",
    description:
      "Get NHTSA 5-star safety ratings for a vehicle.\n" +
      "Shows overall rating, frontal crash, side crash, rollover risk, and safety technology (ESC, forward collision warning, lane departure warning).\n" +
      "Also shows complaint, recall, and investigation counts for the vehicle.",
    annotations: { title: "NHTSA Safety Ratings", readOnlyHint: true },
    parameters: z.object({
      make: z.string().describe("Vehicle make: 'honda', 'toyota', 'ford', 'tesla'"),
      model: z.string().describe("Vehicle model: 'civic', 'camry', 'f-150', 'model 3'"),
      model_year: z.number().describe("Model year: 2020, 2023, 2024"),
    }),
    execute: async (args) => {
      const vehicles = await getSafetyRatingVehicles({ make: args.make, model: args.model, modelYear: args.model_year });
      if (!vehicles.length) return { content: [{ type: "text" as const, text: `No safety ratings found for ${args.model_year} ${args.make} ${args.model}. Try different spelling or year.` }] };

      // Get detailed ratings for each variant
      const details = [];
      for (const v of vehicles.slice(0, 5)) {
        if (v.VehicleId) {
          const rating = await getSafetyRatingDetail(v.VehicleId);
          if (rating) details.push(rating);
        }
      }

      if (!details.length) {
        const names = vehicles.map(v => v.VehicleDescription).join(", ");
        return { content: [{ type: "text" as const, text: `Found ${vehicles.length} variant(s): ${names}\nNo detailed ratings available yet.` }] };
      }

      const lines = details.map(r => {
        const parts = [
          `${r.VehicleDescription ?? "?"}`,
          `  Overall: ${r.OverallRating ?? "N/R"} stars`,
          `  Front Crash: ${r.OverallFrontCrashRating ?? "N/R"} (driver: ${r.FrontCrashDriversideRating ?? "?"}, passenger: ${r.FrontCrashPassengersideRating ?? "?"})`,
          `  Side Crash: ${r.OverallSideCrashRating ?? "N/R"} (driver: ${r.SideCrashDriversideRating ?? "?"}, passenger: ${r.SideCrashPassengersideRating ?? "?"})`,
          `  Rollover: ${r.RolloverRating ?? "N/R"} (risk: ${r.RolloverPossibility != null ? r.RolloverPossibility + "%" : "?"})`,
        ];
        if (r.SidePoleCrashRating) parts.push(`  Side Pole Crash: ${r.SidePoleCrashRating}`);
        if (r.NHTSAElectronicStabilityControl) parts.push(`  ESC: ${r.NHTSAElectronicStabilityControl}`);
        if (r.NHTSAForwardCollisionWarning) parts.push(`  Forward Collision Warning: ${r.NHTSAForwardCollisionWarning}`);
        if (r.NHTSALaneDepartureWarning) parts.push(`  Lane Departure Warning: ${r.NHTSALaneDepartureWarning}`);
        if (r.ComplaintsCount != null) parts.push(`  Complaints: ${r.ComplaintsCount} | Recalls: ${r.RecallsCount ?? 0} | Investigations: ${r.InvestigationCount ?? 0}`);
        return parts.join("\n");
      });

      return { content: [{ type: "text" as const, text: `NHTSA Safety Ratings for ${args.model_year} ${args.make} ${args.model}:\n\n${lines.join("\n\n")}` }] };
    },
  },
];

export { sdkClearCache as clearCache };
