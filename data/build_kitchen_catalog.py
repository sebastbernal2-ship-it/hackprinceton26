"""Generate the kitchen/counter catalog slice: asset JSONs, procedural GLB stand-ins and DEMO ESTIMATE price rows.

    python data/build_kitchen_catalog.py          # writes assets/library/*.json, models/*.glb and rows in data/financial/catalog.json

Every dimension is a nominal class estimate (inches in the table, metres in the output); nothing is read from a spec sheet.
Existing ids or names are never overwritten: a clash aborts the run before anything is written.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from assets.glb import circle_ring, glb_from_parts  # noqa: E402
from assets.models import Asset  # noqa: E402

IN = 0.0254
LIB = ROOT / "assets/library"
CATALOG = ROOT / "data/financial/catalog.json"
AS_OF = "2026-11-14"
TAIL = "Confirm with the manufacturer's spec sheet and the local health, building and fire authority."

# clearance presets: (front m, sides m, back m, why)
CL = {
    "svc": (0.91, 0.0, 0.0, "Front 0.91 m = 36 in working aisle / customer queue lane (health-code style aisle, stated assumption)."),
    "line": (0.91, 0.05, 0.0, "Front 0.91 m = 36 in cook-line aisle; sides 0.05 m = 2 in service gap (stated assumption)."),
    "cold": (0.91, 0.0, 0.05, "Front 0.91 m = 36 in aisle and door swing; back 0.05 m = 2 in air gap for the condenser (stated assumption)."),
    "walkin": (0.91, 0.0, 0.0, "Front 0.91 m = 36 in clear of the door swing and egress aisle (stated assumption)."),
    "ada": (0.91, 0.0, 0.0, "Front 0.91 m = 36 in minimum clear width of an accessible route (2010 ADA Standards 403.5.1)."),
    "hood": (0.3048, 0.3048, 0.0, "Front and sides 0.30 m = 12 in hood overhang past the cooking appliances (stated assumption); overhead, the line below carries the aisle."),
    "wall": (0.3, 0.0, 0.0, "Front 0.30 m = 12 in free reach in front of a wall-mounted piece (stated assumption)."),
    "ware": (1.0, 0.0, 0.0, "Front 1.00 m = about 40 in loading and unloading aisle for rack handling (stated assumption)."),
    "none": (0.0, 0.0, 0.0, "None needed: a small or floor-level piece that does not need its own working aisle (stated assumption)."),
    "ovr": (0.0, 0.0, 0.0, "None: overhead or wall-hung; the working line below carries the aisle (stated assumption)."),
}

# id, name, category, w, d, h (in), shape, clearance, zone, tags, look, price USD, short description, origin class
# shape: "r" rect, "L<arm>" / "U<arm>" arm depth in inches, "rc<radius>" rounded corners
ROWS = [
    # ---- counters ---------------------------------------------------------------------------------------------------
    ("counter_service_60", "Service counter, 60 in", "counter", 60, 28, 42, "r", "svc", "front", [], "counter", 2300, "straight service counter, 60 in run with laminate top", "straight cafe service counter class"),
    ("counter_service_96", "Service counter, 96 in", "counter", 96, 28, 42, "r", "svc", "front", [], "counter", 3600, "straight service counter, 8 ft run with laminate top", "straight cafe service counter class"),
    ("counter_service_120", "Service counter, 120 in", "counter", 120, 28, 42, "r", "svc", "front", [], "counter", 4400, "straight service counter, 10 ft run with laminate top", "straight cafe service counter class"),
    ("counter_service_sink_72", "Service counter with sink cutout, 72 in", "counter", 72, 30, 36, "r", "svc", "front", ["sink"], "counter_sink", 3900, "72 in service counter with a drop-in bar sink cutout and faucet", "service counter with sink cutout class"),
    ("counter_service_cooler_60", "Service counter with built-in cooler, 60 in", "counter", 60, 30, 36, "r", "svc", "front", ["cold"], "counter_cold", 4800, "60 in service counter with a built-in refrigerated base", "service counter with refrigerated base class"),
    ("counter_service_display_72", "Service counter with display front, 72 in", "counter", 72, 32, 42, "r", "svc", "front", ["display"], "counter_glass", 5200, "72 in service counter with a glass display front", "service counter with display front class"),
    ("counter_ada_register_60", "ADA lowered counter with knee space, 60 in", "counter", 60, 24, 34, "r", "ada", "front", ["ada"], "counter", 2800, "60 in lowered register counter, top 34 in high with open knee space", "ADA 904.4 lowered service counter class"),
    ("counter_back_bar_72", "Bar-height back counter, 72 in", "counter", 72, 24, 42, "r", "svc", "bar", ["bar"], "counter", 2600, "72 in back counter at 42 in bar height for espresso and brew gear", "bar-height back counter class"),
    ("counter_waterfall_island_96", "Waterfall island, 96 x 42 in", "counter", 96, 42, 36, "r", "svc", "front", ["island"], "counter_marble", 6800, "stone-look island with waterfall ends, 96 x 42 in", "waterfall island class"),
    ("counter_L_service_120x84", "L-shaped service counter, 120 x 84 in", "counter", 120, 84, 38, "L30", "svc", "front", ["l_shaped"], "counter", 6100, "L-shaped service counter with 30 in deep arms", "L-shaped service counter class"),
    ("counter_U_service_132x96", "U-shaped service counter, 132 x 96 in", "counter", 132, 96, 38, "U30", "svc", "front", ["u_shaped"], "counter", 9200, "U-shaped service counter with 30 in deep arms", "U-shaped service counter class"),
    ("counter_corner_outside_36", "Corner unit, outside 36 x 36 in", "counter", 36, 36, 36, "rc12", "svc", "front", ["corner_capable"], "counter", 1500, "rounded outside corner cabinet that joins two counter runs", "outside corner counter unit class"),
    ("counter_corner_blind_48", "Corner unit, blind L 48 x 48 in", "counter", 48, 48, 36, "L24", "svc", "boh", ["corner_capable", "kitchen"], "counter", 1900, "L-shaped blind corner unit with 24 in arms", "blind corner counter unit class"),
    ("counter_cashier_60", "Cashier counter, 60 in", "counter", 60, 30, 36, "rc6", "svc", "front", [], "counter", 2400, "curved-corner cashier counter with till drawer cutout", "cashier counter class"),
    ("counter_expo_pass_72", "Expo pass shelf, 72 in", "counter", 72, 16, 60, "r", "svc", "boh", ["kitchen", "pass"], "pass", 1500, "stainless expo pass shelf with ticket rail, 72 in", "expo pass shelf class"),
    ("counter_heated_pass_72", "Heat-lamp pass, 72 in", "counter", 72, 28, 62, "r", "svc", "boh", ["kitchen", "pass", "hot_hold"], "pass_lamp", 3200, "heated pass counter with two heat-lamp gantries, 72 in", "heat-lamp pass counter class"),
    ("counter_pickup_48", "Order pick-up counter, 48 in", "counter", 48, 20, 42, "r", "svc", "front", [], "counter", 1300, "order pick-up counter with cubbies, 48 in", "order pick-up counter class"),
    ("work_table_undershelf_60", "Stainless work table with undershelf, 60 x 30 in", "prep_table", 60, 30, 34, "r", "svc", "boh", ["kitchen"], "worktable", 520, "18-gauge stainless work table with galvanized undershelf", "NSF stainless work table class"),
    ("work_table_backsplash_72", "Stainless work table with backsplash, 72 x 30 in", "prep_table", 72, 30, 38, "r", "svc", "boh", ["kitchen"], "worktable", 740, "stainless work table with 4 in rear backsplash and undershelf", "NSF stainless work table class"),
    ("work_table_overshelf_72", "Stainless work table with overshelf, 72 x 30 in", "counter", 72, 30, 60, "r", "svc", "boh", ["kitchen"], "worktable_over", 980, "stainless work table with a 12 in deep wall-height overshelf", "NSF stainless work table class"),
    ("counter_handwash_36", "Hand-wash counter, 36 in", "counter", 36, 24, 36, "r", "ada", "front", ["sink", "hand_wash"], "counter_sink", 1700, "customer-facing hand-wash counter with sink, 36 in", "hand-wash counter class"),
    ("prep_table_butcher_block_60", "Butcher-block prep table, 60 x 30 in", "prep_table", 60, 30, 36, "r", "svc", "boh", ["kitchen"], "worktable_wood", 1250, "hardwood butcher-block top on a stainless frame, 60 x 30 in", "butcher-block prep table class"),
    ("table_bakers_marble_72", "Bakers marble table, 72 x 30 in", "prep_table", 72, 30, 36, "r", "svc", "boh", ["kitchen", "bakery"], "worktable_marble", 1800, "marble-top bakers table with stainless base, 72 x 30 in", "bakers marble table class"),
    ("shelf_wall_stainless_48", "Stainless wall shelf, 48 in", "storage", 48, 14, 2, "r", "wall", "boh", ["kitchen", "wall_mounted"], "shelf", 190, "wall-mounted stainless shelf with bracket set, 48 x 14 in", "wall-mounted stainless shelf class"),
    ("shelf_wall_stainless_72", "Stainless wall shelf, 72 in", "storage", 72, 14, 2, "r", "wall", "boh", ["kitchen", "wall_mounted"], "shelf", 270, "wall-mounted stainless shelf with bracket set, 72 x 14 in", "wall-mounted stainless shelf class"),
    # ---- refrigeration ----------------------------------------------------------------------------------------------
    ("fridge_reachin_3door", "Reach-in refrigerator, 3 door", "fridge", 81, 32, 83, "r", "cold", "boh", ["kitchen", "cold"], "fridge3", 6200, "3-door solid-door reach-in refrigerator, 72 cu ft class", "NSF reach-in refrigerator class"),
    ("freezer_reachin_1door", "Reach-in freezer, 1 door", "fridge", 27, 32, 83, "r", "cold", "boh", ["kitchen", "cold", "freezer"], "fridge1", 3300, "1-door solid reach-in freezer, 20 cu ft class", "NSF reach-in freezer class"),
    ("freezer_reachin_2door", "Reach-in freezer, 2 door", "fridge", 54, 32, 83, "r", "cold", "boh", ["kitchen", "cold", "freezer"], "fridge2", 5400, "2-door solid reach-in freezer, 49 cu ft class", "NSF reach-in freezer class"),
    ("freezer_reachin_3door", "Reach-in freezer, 3 door", "fridge", 81, 32, 83, "r", "cold", "boh", ["kitchen", "cold", "freezer"], "fridge3", 7600, "3-door solid reach-in freezer, 72 cu ft class", "NSF reach-in freezer class"),
    ("merchandiser_glass_door_2door", "Glass-door merchandiser, 2 door", "fridge", 54, 30, 80, "r", "cold", "display", ["cold", "front_of_house"], "glass2", 3900, "2-door glass merchandiser with LED interior", "glass-door merchandiser class"),
    ("merchandiser_glass_door_3door", "Glass-door merchandiser, 3 door", "fridge", 78, 30, 80, "r", "cold", "display", ["cold", "front_of_house"], "glass3", 5400, "3-door glass merchandiser with LED interior", "glass-door merchandiser class"),
    ("fridge_undercounter_2door_48", "Undercounter refrigerator, 2 door 48 in", "fridge", 48, 30, 34, "r", "cold", "boh", ["kitchen", "cold"], "fridge2_low", 2700, "2-door undercounter refrigerator, 48 in wide", "NSF undercounter refrigerator class"),
    ("freezer_undercounter_2door_48", "Undercounter freezer, 2 door 48 in", "fridge", 48, 30, 34, "r", "cold", "boh", ["kitchen", "cold", "freezer"], "fridge2_low", 3400, "2-door undercounter freezer, 48 in wide", "NSF undercounter freezer class"),
    ("fridge_drawer_2drawer_36", "Drawer refrigerator, 2 drawer 36 in", "fridge", 36, 30, 34, "r", "cold", "boh", ["kitchen", "cold"], "drawers", 3600, "2-drawer undercounter refrigerator for proteins and garnish, 36 in", "refrigerated drawer class"),
    ("fridge_worktop_48", "Worktop refrigerator, 48 in", "fridge", 48, 30, 38, "r", "cold", "boh", ["kitchen", "cold"], "fridge2_low", 2900, "2-door worktop refrigerator with stainless top, 48 in", "NSF worktop refrigerator class"),
    ("fridge_worktop_60", "Worktop refrigerator, 60 in", "fridge", 60, 30, 38, "r", "cold", "boh", ["kitchen", "cold"], "fridge3_low", 3400, "3-door worktop refrigerator with stainless top, 60 in", "NSF worktop refrigerator class"),
    ("fridge_worktop_72", "Worktop refrigerator, 72 in", "fridge", 72, 30, 38, "r", "cold", "boh", ["kitchen", "cold"], "fridge3_low", 3900, "3-door worktop refrigerator with stainless top, 72 in", "NSF worktop refrigerator class"),
    ("freezer_worktop_60", "Worktop freezer, 60 in", "fridge", 60, 30, 38, "r", "cold", "boh", ["kitchen", "cold", "freezer"], "fridge3_low", 4200, "3-door worktop freezer with stainless top, 60 in", "NSF worktop freezer class"),
    ("prep_table_sandwich_27", "Sandwich prep table, 27 in", "fridge", 27, 30, 43, "r", "cold", "boh", ["kitchen", "cold"], "prep", 2400, "1-door refrigerated sandwich prep table with 7 pan rail", "NSF refrigerated prep table class"),
    ("prep_table_sandwich_60", "Sandwich prep table, 60 in", "fridge", 60, 30, 44, "r", "cold", "boh", ["kitchen", "cold"], "prep", 3600, "2-door refrigerated sandwich prep table with 16 pan rail", "NSF refrigerated prep table class"),
    ("prep_table_sandwich_72", "Sandwich prep table, 72 in", "fridge", 72, 30, 44, "r", "cold", "boh", ["kitchen", "cold"], "prep", 4300, "3-door refrigerated sandwich prep table with 18 pan rail", "NSF refrigerated prep table class"),
    ("prep_table_salad_60", "Salad prep table, 60 in", "fridge", 60, 30, 44, "r", "cold", "boh", ["kitchen", "cold"], "prep", 3500, "2-door refrigerated salad prep table with cutting board", "NSF refrigerated prep table class"),
    ("prep_table_pizza_48", "Pizza prep table, 48 in", "fridge", 48, 34, 44, "r", "cold", "boh", ["kitchen", "cold", "pizza"], "prep", 3300, "refrigerated pizza prep table with a 34 in deep marble-look board", "NSF refrigerated pizza prep table class"),
    ("back_bar_cooler_3door_72", "Back-bar cooler, 3 door 72 in", "fridge", 72, 26, 35, "r", "cold", "bar", ["bar", "cold", "front_of_house"], "glass3_low", 4200, "3-door back-bar bottle cooler, 72 in", "back-bar bottle cooler class"),
    ("walkin_cooler_8x8", "Walk-in cooler, 8x8 ft", "storage", 96, 96, 84, "r", "walkin", "boh", ["kitchen", "cold", "walk_in"], "walkin", 11500, "8 x 8 ft modular walk-in cooler with floor and remote or top-mount condenser", "modular walk-in cooler class"),
    ("walkin_cooler_8x10", "Walk-in cooler, 8x10 ft", "storage", 120, 96, 84, "r", "walkin", "boh", ["kitchen", "cold", "walk_in"], "walkin", 13500, "8 x 10 ft modular walk-in cooler with floor and remote or top-mount condenser", "modular walk-in cooler class"),
    ("walkin_freezer_8x8", "Walk-in freezer, 8x8 ft", "storage", 96, 96, 84, "r", "walkin", "boh", ["kitchen", "cold", "walk_in", "freezer"], "walkin", 14500, "8 x 8 ft modular walk-in freezer with insulated floor", "modular walk-in freezer class"),
    ("walkin_freezer_8x10", "Walk-in freezer, 8x10 ft", "storage", 120, 96, 84, "r", "walkin", "boh", ["kitchen", "cold", "walk_in", "freezer"], "walkin", 16800, "8 x 10 ft modular walk-in freezer with insulated floor", "modular walk-in freezer class"),
    ("blast_chiller_reachin_20pan", "Blast chiller, reach-in 20 pan", "fridge", 33, 35, 80, "r", "cold", "boh", ["kitchen", "cold"], "fridge1", 12500, "reach-in blast chiller / shock freezer for 20 sheet pans", "blast chiller class"),
    ("display_ice_cream_dipping_60", "Ice cream dipping cabinet, 60 in", "freezer_display", 60, 30, 36, "r", "svc", "display", ["cold", "front_of_house", "gelato"], "dipping", 5200, "12-tub ice cream dipping cabinet with sneeze-guard lid, 60 in", "ice cream dipping cabinet class"),
    ("display_fridge_countertop_27", "Countertop display refrigerator, 27 in", "freezer_display", 27, 24, 30, "r", "svc", "display", ["cold", "front_of_house"], "glass_small", 1400, "countertop glass-door display refrigerator, 27 in", "countertop display refrigerator class"),
    ("fridge_milk_dairy_36", "Milk and dairy cooler, 36 in", "fridge", 36, 30, 72, "r", "cold", "boh", ["cold", "kitchen", "dairy"], "fridge1", 3100, "crate-style milk and dairy cooler for 4 gal crates, 36 in", "milk and dairy cooler class"),
    ("cooler_slide_door_drink_3door_72", "Slide-door drink cooler, 3 door 72 in", "fridge", 72, 27, 36, "r", "cold", "display", ["cold", "front_of_house", "beverage"], "slide3", 3700, "3 sliding-door glass beverage cooler, 72 in", "sliding-door drink cooler class"),
    ("fridge_wine_beverage_24", "Wine and beverage fridge, undercounter 24 in", "fridge", 24, 24, 34, "r", "cold", "bar", ["bar", "cold", "front_of_house"], "glass_small", 1500, "undercounter dual-zone wine and beverage fridge, 24 in", "undercounter wine fridge class"),
    ("ice_bin_48", "Ice bin, 48 in", "storage", 48, 30, 40, "r", "svc", "bar", ["bar", "cold"], "steel", 1900, "insulated stainless ice storage bin, 48 in with cold plate", "ice storage bin class"),
    ("ice_maker_head_30", "Ice maker head, 30 in 500 lb", "other", 30, 24, 23, "r", "cold", "boh", ["kitchen", "cold", "ice"], "steel", 4300, "30 in modular ice maker head, about 500 lb per day, sits on a bin", "modular ice maker head class"),
    # ---- cooking and food prep --------------------------------------------------------------------------------------
    ("range_2burner_oven_24", "Gas range, 2 burner with oven, 24 in", "range", 24, 31, 56, "r", "line", "boh", ["kitchen", "cooking"], "range2", 2300, "24 in gas range, 2 burners with oven and backguard", "commercial restaurant range class"),
    ("range_4burner_oven_36", "Gas range, 4 burner with oven, 36 in", "range", 36, 31, 56, "r", "line", "boh", ["kitchen", "cooking"], "range4", 3400, "36 in gas range, 4 burners and a griddle plate with oven", "commercial restaurant range class"),
    ("range_6burner_oven_48", "Gas range, 6 burner with oven, 48 in", "range", 48, 31, 56, "r", "line", "boh", ["kitchen", "cooking"], "range6", 4600, "48 in gas range, 6 burners with a 12 in griddle and oven", "commercial restaurant range class"),
    ("griddle_flat_24", "Gas flat-top griddle, 24 in", "range", 24, 30, 16, "r", "line", "boh", ["kitchen", "cooking", "griddle"], "griddle", 1500, "24 in countertop gas griddle, 1 in plate", "commercial gas griddle class"),
    ("griddle_flat_48", "Gas flat-top griddle, 48 in", "range", 48, 30, 16, "r", "line", "boh", ["kitchen", "cooking", "griddle"], "griddle", 2900, "48 in countertop gas griddle, 1 in plate", "commercial gas griddle class"),
    ("charbroiler_48", "Gas charbroiler, 48 in", "range", 48, 32, 16, "r", "line", "boh", ["kitchen", "cooking", "open_flame"], "griddle", 2600, "48 in countertop radiant gas charbroiler", "commercial gas charbroiler class"),
    ("fryer_floor_2vat_80lb", "Gas floor fryer, 2 vat 80 lb", "range", 31, 32, 47, "r", "line", "boh", ["kitchen", "cooking"], "fryer", 3900, "2-vat gas floor fryer, 40 lb per vat", "commercial gas floor fryer class"),
    ("fryer_countertop_1vat_15lb", "Electric countertop fryer, 1 vat 15 lb", "range", 14, 24, 17, "r", "line", "boh", ["kitchen", "cooking"], "fryer_small", 650, "1-vat electric countertop fryer, 15 lb oil", "countertop fryer class"),
    ("salamander_broiler_36", "Salamander broiler, 36 in", "oven", 36, 18, 24, "r", "ovr", "boh", ["kitchen", "cooking", "overhead", "wall_mounted"], "salamander", 2300, "36 in gas salamander broiler on a wall or range riser", "commercial salamander class"),
    ("cheese_melter_36", "Cheese melter, 36 in", "oven", 36, 16, 20, "r", "ovr", "boh", ["kitchen", "cooking", "overhead", "wall_mounted"], "salamander", 1900, "36 in gas cheese melter on a wall or range riser", "commercial cheese melter class"),
    ("steamer_countertop_3pan", "Convection steamer, countertop 3 pan", "oven", 21, 30, 24, "r", "line", "boh", ["kitchen", "cooking"], "steamer", 4800, "3-pan electric convection steamer for countertop use", "commercial convection steamer class"),
    ("combi_oven_10pan", "Combi oven, 10 pan electric", "oven", 43, 40, 63, "r", "line", "boh", ["kitchen", "cooking"], "combi", 17000, "10-pan electric combi oven with stand", "commercial combi oven class"),
    ("convection_oven_double_stack", "Convection oven, double stack half size", "oven", 31, 30, 62, "r", "line", "boh", ["kitchen", "cooking", "bakery"], "oven_stack", 6900, "two half-size electric convection ovens stacked on a stand", "commercial convection oven class"),
    ("oven_deck_bakery_2deck", "Deck oven, bakery 2 deck", "oven", 50, 40, 62, "r", "line", "boh", ["kitchen", "cooking", "bakery"], "oven_stack", 11500, "2-deck electric bakery deck oven with stone hearth", "commercial bakery deck oven class"),
    ("soup_warmer_countertop_11qt", "Soup warmer, countertop 11 qt", "other", 14, 14, 15, "rc4", "none", "boh", ["kitchen", "hot_hold"], "warmer", 230, "11 qt countertop soup kettle warmer", "countertop soup warmer class"),
    ("cabinet_heated_holding_full", "Heated holding cabinet, full height", "storage", 28, 32, 72, "r", "line", "boh", ["kitchen", "hot_hold"], "tall_door", 3100, "full-height insulated heated holding cabinet with 18 pan slides", "heated holding cabinet class"),
    ("bain_marie_countertop_4pan", "Bain-marie, countertop 4 pan", "other", 28, 20, 10, "r", "none", "boh", ["kitchen", "hot_hold"], "warmer", 800, "countertop 4-pan electric bain-marie", "countertop bain-marie class"),
    ("cooktop_induction_2zone", "Induction cooktop, countertop 2 zone", "range", 24, 18, 5, "r", "none", "boh", ["kitchen", "cooking"], "induction", 1900, "2-zone countertop commercial induction cooktop", "commercial induction cooktop class"),
    ("range_induction_4zone_24", "Induction range, 4 zone 24 in", "range", 24, 30, 36, "r", "line", "boh", ["kitchen", "cooking"], "range4", 5800, "24 in 4-zone induction range with oven base", "commercial induction range class"),
    ("immersion_circulator_12qt", "Immersion circulator with 12 qt tub", "other", 14, 8, 12, "r", "none", "boh", ["kitchen", "cooking"], "warmer", 580, "sous-vide immersion circulator on a 12 qt polycarbonate tub", "sous-vide immersion circulator class"),
    ("waffle_maker_belgian_double", "Waffle maker, double Belgian", "oven", 20, 18, 11, "r", "none", "boh", ["kitchen", "cooking", "breakfast"], "press", 640, "double-sided Belgian waffle maker with rotating bases", "commercial waffle maker class"),
    ("crepe_maker_16", "Crepe maker, 16 in plate", "oven", 20, 18, 7, "rc4", "none", "boh", ["kitchen", "cooking", "breakfast"], "griddle_round", 520, "16 in single-plate electric crepe maker", "commercial crepe maker class"),
    ("toaster_oven_countertop_6slice", "Toaster oven, countertop 6 slice", "oven", 22, 16, 11, "r", "none", "boh", ["kitchen", "cooking"], "press", 330, "6-slice commercial countertop toaster oven", "commercial toaster oven class"),
    ("mixer_planetary_12qt", "Stand mixer, 12 qt planetary", "other", 15, 18, 28, "r", "none", "boh", ["kitchen", "bakery"], "mixer", 1500, "12 qt countertop planetary stand mixer", "commercial stand mixer class"),
    ("food_processor_3qt", "Food processor, 3 qt", "other", 9, 14, 20, "r", "none", "boh", ["kitchen"], "mixer", 1050, "3 qt batch bowl food processor with S-blade", "commercial food processor class"),
    ("slicer_meat_12", "Meat slicer, 12 in manual", "other", 24, 22, 17, "r", "none", "boh", ["kitchen"], "slicer", 1350, "12 in gravity-feed manual deli slicer", "commercial deli slicer class"),
    ("blender_commercial_64oz", "Commercial blender, 64 oz", "other", 9, 10, 22, "r", "none", "bar", ["bar", "front_of_house", "beverage"], "blender", 620, "64 oz bar blender with sound cover", "commercial bar blender class"),
    # ---- ware washing, sinks, plumbing ------------------------------------------------------------------------------
    ("dish_machine_door_type_20", "Dishwasher, door-type 20 in rack", "dish", 26, 27, 78, "r", "ware", "boh", ["kitchen", "ware_wash"], "tall_door", 6800, "door-type high-temp dishmachine with 20 x 20 in rack", "door-type dishmachine class"),
    ("dish_machine_conveyor_44", "Dishwasher, conveyor 44 in single tank", "dish", 100, 30, 70, "r", "ware", "boh", ["kitchen", "ware_wash"], "conveyor", 17500, "single-tank conveyor dishmachine, 44 in rack width class", "conveyor dishmachine class"),
    ("sink_three_comp_drainboards_120", "Three-compartment sink with drainboards, 120 in", "sink", 120, 30, 44, "r", "ware", "boh", ["kitchen", "sink", "ware_wash"], "sink3", 2700, "three 18 x 18 in bowls with two 24 in drainboards, 120 in overall", "NSF three-compartment sink class"),
    ("sink_pot_1comp_36", "Pot sink, 1 compartment 36 in bowl", "sink", 48, 30, 44, "r", "ware", "boh", ["kitchen", "sink", "ware_wash"], "sink1", 1400, "single 36 x 24 in deep pot sink with drainboard", "NSF pot sink class"),
    ("sink_prep_double_48", "Prep sink, double bowl 48 in", "sink", 48, 24, 44, "r", "svc", "boh", ["kitchen", "sink", "prep"], "sink2", 1300, "two 16 x 20 in bowls with gooseneck faucet, 48 in", "NSF prep sink class"),
    ("sink_hand_knee_valve_18", "Hand sink, knee-operated 18 in", "sink", 18, 18, 24, "r", "wall", "boh", ["kitchen", "sink", "hand_wash"], "sink_hand", 450, "wall-mounted hand sink with knee valve and splash guard", "NSF hand sink class"),
    ("grease_interceptor_50lb", "Grease interceptor, 50 lb floor", "other", 26, 17, 14, "r", "none", "boh", ["kitchen", "utility", "floor"], "steel", 1200, "floor-mounted 50 lb grease trap with flow control", "grease interceptor class"),
    ("floor_drain_6", "Floor drain, 6 in", "other", 6, 6, 1, "r", "none", "boh", ["kitchen", "utility", "floor"], "drain", 140, "6 in floor drain with grate", "floor drain class"),
    # ---- air, fire and structure ------------------------------------------------------------------------------------
    ("hood_type1_6ft", "Type I hood 6 ft x 48 in", "hood", 72, 48, 24, "r", "hood", "boh", ["kitchen", "overhead"], "hood", 5200, "Type I wall-mount canopy exhaust hood with grease filters, 6 ft", "Type I exhaust hood class"),
    ("hood_type1_8ft", "Type I hood 8 ft x 48 in", "hood", 96, 48, 24, "r", "hood", "boh", ["kitchen", "overhead"], "hood", 6800, "Type I wall-mount canopy exhaust hood with grease filters, 8 ft", "Type I exhaust hood class"),
    ("hood_type1_10ft", "Type I hood 10 ft x 48 in", "hood", 120, 48, 24, "r", "hood", "boh", ["kitchen", "overhead"], "hood", 8400, "Type I wall-mount canopy exhaust hood with grease filters, 10 ft", "Type I exhaust hood class"),
    ("makeup_air_unit_2000cfm", "Makeup air unit, 2000 cfm", "other", 48, 36, 30, "r", "ovr", "boh", ["kitchen", "overhead", "utility"], "fan", 6200, "2000 cfm direct-fired makeup air unit for the exhaust hood", "makeup air unit class"),
    ("fire_suppression_panel", "Fire suppression panel and tank", "other", 14, 10, 30, "r", "wall", "boh", ["kitchen", "overhead", "utility", "wall_mounted"], "panel", 1600, "wet-chemical hood fire suppression panel and tank", "kitchen fire suppression class"),
    # ---- storage ----------------------------------------------------------------------------------------------------
    ("cart_utility_3shelf", "Utility cart, 3 shelf", "storage", 38, 20, 36, "r", "none", "boh", ["kitchen", "mobile"], "cart", 260, "3-shelf utility cart on casters, 38 x 20 in", "utility cart class"),
    ("rack_dunnage_48", "Dunnage rack, 48 in", "storage", 48, 24, 12, "r", "none", "boh", ["kitchen", "storage"], "dunnage", 210, "48 in slotted dunnage rack for sacks and cases", "dunnage rack class"),
    ("shelving_dry_storage_72x24", "Dry storage shelving, 72 x 24 in", "storage", 72, 24, 72, "r", "none", "boh", ["kitchen", "storage"], "shelving", 520, "4-shelf chrome dry storage shelving, 72 x 24 in", "NSF dry storage shelving class"),
    ("shelf_chemical_48", "Chemical storage shelf, 48 in", "storage", 48, 14, 36, "r", "none", "boh", ["kitchen", "storage"], "shelving", 360, "labelled low chemical storage shelf kept below food storage, 48 in", "chemical storage shelf class"),
    ("rack_dish_cart_20", "Dish rack cart, 20 x 20 in", "storage", 22, 22, 36, "r", "none", "boh", ["kitchen", "ware_wash"], "cart", 240, "dish rack dolly with 4 peg racks, 22 x 22 in", "dish rack cart class"),
    ("trash_can_44gal", "Trash can, 44 gal", "storage", 24, 24, 38, "rc8", "none", "boh", ["kitchen", "utility"], "bin", 120, "44 gal round commercial trash can", "commercial trash can class"),
]


def mm(v: float) -> float:
    return round(v * IN, 4)


def footprint(shape, w, d):
    """Closed ring ([x, y] metres) anchored at the origin. y grows toward the front."""
    if shape == "r":
        pts = [(0, 0), (w, 0), (w, d), (0, d)]
    elif shape.startswith("L"):
        a = float(shape[1:])
        pts = [(0, 0), (w, 0), (w, a), (a, a), (a, d), (0, d)]
    elif shape.startswith("U"):
        a = float(shape[1:])
        pts = [(0, 0), (w, 0), (w, d), (w - a, d), (w - a, a), (a, a), (a, d), (0, d)]
    elif shape.startswith("rc"):
        r = float(shape[2:])
        pts = []
        for cx, cy, a0 in ((w - r, r, -90), (w - r, d - r, 0), (r, d - r, 90), (r, r, 180)):
            for k in range(5):
                t = math.radians(a0 + 18 * k)
                pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    else:
        raise ValueError(shape)
    ring = [[round(x * IN, 4), round(y * IN, 4)] for x, y in pts]
    ox, oy = min(p[0] for p in ring), min(p[1] for p in ring)
    ring = [[round(p[0] - ox, 4), round(p[1] - oy, 4)] for p in ring]
    return ring + [ring[0]]


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]


STEEL, TOP, DOOR, GLASS, DARK, WOOD, MARBLE, PANEL, LAMINATE = "#b4b9be", "#d8dbde", "#8d949b", "#a9cbdc", "#33373b", "#a9794b", "#e8e5df", "#e9ecee", "#b9a27f"


def parts_for(look, ring, w, d, h):
    """Procedural stand-in: body, top and a few readable details per look. Front is +y."""
    def P(r, y0, y1, m, c):
        return {"ring": r, "y0": y0, "y1": y1, "material": m, "color": c}

    def shell(c=STEEL, top=0.05):
        return [P(ring, 0.0, h - top, "body", c), P(ring, h - top, h, "top", TOP)]

    t = 0.012

    def doors(n, mat, col, y0, y1):
        return [P(rect(w * (i + 0.04) / n, d - t, w * (i + 0.96) / n, d), y0, y1, mat, col) for i in range(n)]

    if look in ("counter", "counter_cold", "counter_glass", "counter_sink", "counter_marble"):
        top = {"counter": LAMINATE, "counter_cold": LAMINATE, "counter_glass": LAMINATE, "counter_sink": TOP, "counter_marble": MARBLE}[look]
        out = [P(ring, 0.0, h - 0.04, "body", "#5d6168"), P(ring, h - 0.04, h, "top", top)]
        if look == "counter_glass":
            out.append(P(rect(0.03, d * 0.45, w - 0.03, d - 0.01), h * 0.45, h - 0.04, "glass", GLASS))
        if look == "counter_cold":
            out += doors(max(2, round(w / 0.6)), "door", DOOR, 0.1, h * 0.55)
        if look == "counter_sink":
            out.append(P(rect(w * 0.35, d * 0.25, w * 0.65, d * 0.7), h - 0.006, h + 0.004, "sink", DARK))
        return out
    if look in ("pass", "pass_lamp"):
        out = [P(ring, 0.0, 0.9, "body", STEEL), P(ring, 0.9, 0.93, "top", TOP), P(rect(0, 0, w, 0.04), 0.93, h - 0.05, "rail", DARK)]
        if look == "pass_lamp":
            out += [P(rect(w * k - 0.12, d * 0.2, w * k + 0.12, d * 0.8), h - 0.05, h, "lamp", "#d9772b") for k in (0.3, 0.7)]
        else:
            out.append(P(rect(0, 0, w, d), h - 0.03, h, "shelf", STEEL))
        return out
    if look in ("worktable", "worktable_over", "worktable_wood", "worktable_marble"):
        top = {"worktable": TOP, "worktable_over": TOP, "worktable_wood": WOOD, "worktable_marble": MARBLE}[look]
        tt = 0.86 if look == "worktable_over" else min(h, 0.9)
        out = [P(ring, tt - 0.05, tt, "top", top), P(ring, 0.18, 0.2, "undershelf", STEEL)]
        out += [P(rect(x, y, x + 0.04, y + 0.04), 0.0, tt - 0.05, "leg", STEEL) for x in (0.0, w - 0.04) for y in (0.0, d - 0.04)]
        if look == "worktable" and h > tt + 0.01:
            out.append(P(rect(0, 0, w, 0.025), tt, h, "splash", TOP))
        if look == "worktable_over":
            out += [P(rect(0, 0, 0.03, 0.3), tt, h, "post", STEEL), P(rect(w - 0.03, 0, w, 0.3), tt, h, "post", STEEL),
                    P(rect(0, 0, w, 0.3), 1.15, 1.18, "overshelf", STEEL), P(rect(0, 0, w, 0.3), 1.42, 1.45, "overshelf", STEEL)]
        return out
    if look.startswith(("fridge", "glass")) or look in ("drawers", "slide3", "dipping", "tall_door"):
        low = look.endswith("_low") or look in ("drawers", "slide3", "dipping")
        out = shell(STEEL, 0.05) if low else [P(ring, 0.0, h, "body", STEEL)]
        digits = "".join(c for c in look if c.isdigit())
        n = int(digits) if digits else 1
        if look.startswith("glass") or look == "slide3":
            out += doors(n, "glass", GLASS, 0.1, h - 0.1 if low else h - 0.06)
        elif look == "dipping":
            out.append(P(rect(0.03, 0.03, w - 0.03, d * 0.7), h * 0.62, h, "lid", GLASS))
        elif look == "drawers":
            out += [P(rect(w * 0.03, d - t, w * 0.97, d), h * a, h * b, "door", DOOR) for a, b in ((0.08, 0.45), (0.5, 0.9))]
        else:
            out += doors(n, "door", DOOR, 0.1, h - 0.1)
        return out
    if look == "prep":
        out = [P(ring, 0.0, h * 0.62, "body", STEEL), P(ring, h * 0.62, h * 0.66, "top", TOP),
               P(rect(0.02, 0.02, w - 0.02, d * 0.42), h * 0.66, h * 0.8, "pans", "#6c8c3a"),
               P(rect(0.0, d * 0.42, w, d - 0.01), h * 0.66, h * 0.7, "board", "#e4dfd4")]
        return out + doors(max(1, round(w / 0.6)), "door", DOOR, 0.08, h * 0.58)
    if look in ("range2", "range4", "range6", "induction"):
        n = {"range2": 2, "range4": 4, "range6": 6, "induction": 2}[look]
        if look == "induction":
            out, ytop = [P(ring, 0.0, h, "body", DARK)], h
        else:
            ytop = h * 0.66
            out = [P(ring, 0.0, h * 0.62, "body", STEEL), P(ring, h * 0.62, ytop, "top", TOP), P(rect(0, 0, w, 0.06), ytop, h, "backguard", STEEL)]
            out += [P(rect(w * 0.08, d - t, w * 0.92, d), h * 0.12, h * 0.5, "door", DOOR)]
        cols = max(1, n // 2)
        for i in range(n):
            cx = w * ((i % cols) + 0.5) / cols
            cy = d * (0.3 if i < cols else 0.65)
            out.append(P(circle_ring(cx, cy, min(w / cols, d / 2.3) * 0.32, 12), ytop, ytop + 0.02, "burner", "#1d1f21"))
        return out
    if look in ("griddle", "griddle_round"):
        out = [P(ring, 0.0, h * 0.7, "body", STEEL), P(rect(0.01, 0.01, w - 0.01, d - 0.08), h * 0.7, h * 0.78, "plate", "#6d7378")]
        if look == "griddle":
            out += [P(rect(w * (i + 0.2) / 4, d - 0.05, w * (i + 0.5) / 4, d), h * 0.2, h * 0.5, "knob", DARK) for i in range(4)]
        return out
    if look in ("fryer", "fryer_small"):
        n = 2 if look == "fryer" else 1
        return shell(STEEL, 0.05) + [P(rect(w * (i + 0.12) / n, d * 0.2, w * (i + 0.88) / n, d * 0.7), h - 0.06, h - 0.02, "oil", "#b9822c") for i in range(n)]
    if look == "salamander":
        return [P(ring, 0.0, h, "body", STEEL), P(rect(0.02, d - t, w - 0.02, d), h * 0.2, h * 0.75, "door", DARK)]
    if look in ("steamer", "combi", "oven_stack", "press"):
        out = shell(STEEL, 0.03)
        for i in range(2 if look == "oven_stack" else 1):
            y0, y1 = (h * (0.08 + 0.45 * i), h * (0.45 + 0.45 * i)) if look == "oven_stack" else (h * 0.12, h * (0.7 if look == "press" else 0.8))
            out.append(P(rect(w * 0.08, d - t, w * 0.82, d), y0, y1, "door", DARK))
        return out
    if look == "warmer":
        return [P(ring, 0.0, h * 0.75, "body", STEEL), P(rect(0.02, 0.02, w - 0.02, d - 0.02), h * 0.75, h, "well", "#7c838a")]
    if look == "mixer":
        return [P(rect(0.0, 0.0, w, d), 0.0, h * 0.18, "base", STEEL), P(rect(w * 0.15, d * 0.1, w * 0.85, d * 0.6), h * 0.18, h * 0.75, "head", STEEL),
                P(rect(w * 0.25, d * 0.45, w * 0.75, d * 0.95), h * 0.18, h * 0.5, "bowl", TOP)]
    if look == "slicer":
        return [P(ring, 0.0, h * 0.4, "base", STEEL), P(circle_ring(w * 0.4, d * 0.5, min(w, d) * 0.4, 16), h * 0.4, h * 0.9, "blade", "#cfd3d6")]
    if look == "blender":
        return [P(ring, 0.0, h * 0.3, "base", DARK), P(circle_ring(w / 2, d / 2, min(w, d) * 0.4, 12), h * 0.3, h, "jar", GLASS)]
    if look in ("sink1", "sink2", "sink3", "sink_hand"):
        n = {"sink1": 1, "sink2": 2, "sink3": 3, "sink_hand": 1}[look]
        out = [P(ring, 0.0, h * 0.78, "body", STEEL), P(ring, h * 0.78, h * 0.8, "top", TOP), P(rect(0, 0, w, 0.04), h * 0.8, h, "splash", TOP)]
        bw = w * (0.62 if look == "sink3" else 0.9) / n
        out += [P(rect(w * 0.04 + i * bw * 1.04 + (w * 0.17 if look == "sink3" else 0), d * 0.2, w * 0.04 + i * bw * 1.04 + bw * 0.92 + (w * 0.17 if look == "sink3" else 0), d * 0.8), h * 0.8, h * 0.8 + 0.005, "bowl", DARK) for i in range(n)]
        return out
    if look == "conveyor":
        return [P(ring, 0.0, h * 0.5, "body", STEEL), P(rect(w * 0.15, 0, w * 0.85, d), h * 0.5, h, "hood", DOOR), P(rect(0, d * 0.2, w, d * 0.8), h * 0.5, h * 0.55, "belt", DARK)]
    if look == "walkin":
        return [P(ring, 0.0, h, "panel", PANEL), P(rect(w * 0.38, d - 0.025, w * 0.62, d), 0.0, 2.0, "door", DOOR)]
    if look == "hood":
        return [P(ring, 0.0, h * 0.35, "canopy", STEEL), P(rect(w * 0.1, d * 0.1, w * 0.9, d * 0.9), h * 0.35, h * 0.6, "canopy", STEEL), P(rect(w * 0.18, d * 0.2, w * 0.82, d * 0.8), h * 0.6, h, "duct", TOP)]
    if look in ("shelf", "shelving", "dunnage", "cart"):
        n = {"shelf": 2, "shelving": 4, "cart": 3, "dunnage": 1}[look]
        sh = 0.02
        out = [P(ring, (h - sh) * i / max(n - 1, 1), (h - sh) * i / max(n - 1, 1) + sh, "shelf", STEEL) for i in range(n)]
        if look in ("shelving", "cart"):
            out += [P(rect(x, y, x + 0.03, y + 0.03), 0.0, h, "post", DARK) for x in (0.0, w - 0.03) for y in (0.0, d - 0.03)]
        return out
    if look == "bin":
        return [P(circle_ring(w / 2, d / 2, min(w, d) / 2, 16), 0.0, h, "bin", "#4b5b4e")]
    if look == "panel":
        return [P(ring, 0.0, h, "panel", "#a73a2e")]
    if look in ("fan", "drain"):
        return [P(ring, 0.0, h, "casing" if look == "fan" else "grate", STEEL if look == "fan" else DARK)]
    return shell()


def vendor(i):
    return f"https://www.webstaurantstore.com/search/{i.replace('_', '-')}.html"


def build():
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    have = {e["id"] for k in ("equipment", "reskinEquipment") for e in cat[k]}
    names = {json.loads(f.read_text(encoding="utf-8"))["name"].lower() for f in LIB.glob("*.json")}
    ids = [r[0] for r in ROWS]
    assert len(ids) == len(set(ids)), "duplicate ids in the table"
    assert len({r[1].lower() for r in ROWS}) == len(ROWS), "duplicate names in the table"
    for r in ROWS:
        if (LIB / f"{r[0]}.json").exists() or r[0] in have or r[1].lower() in names:
            raise SystemExit(f"already exists: {r[0]} / {r[1]}")
    new_rows, assets = [], []
    for (aid, name, category, wi, di, hi, shape, clr, zone, tags, look, price, desc, klass) in ROWS:
        w, d, h = mm(wi), mm(di), mm(hi)
        fp = footprint(shape, wi, di)
        f, s, b, why = CL[clr]
        look = "worktable" if look == "counter" else look
        (LIB / "models" / f"{aid}.glb").write_bytes(glb_from_parts(parts_for(look, [tuple(p) for p in fp], w, d, h), generator="pi-assets procedural parts (kitchen slice)"))
        zone_tags = ["front_of_house"] if zone in ("front", "display", "bar") else ["kitchen"]
        a = {
            "assetId": aid, "name": name, "category": category, "source": "library", "parentAssetId": None, "variantKind": "base",
            "dims": {"w": w, "d": d, "h": h}, "dimsStatus": "estimated", "dimRanges": None, "allowedSizes": None, "footprint": fp,
            "clearance": {"front": f, "sides": s, "back": b},
            "clearanceBasis": f"ASSUMPTION (not a code determination): front {f:.2f} m, sides {s:.2f} m, back {b:.2f} m. {why} {TAIL}",
            "model": {"uri": f"assets/library/models/{aid}.glb", "format": "glb"}, "imageRefs": [], "profileId": None,
            "tags": list(dict.fromkeys([f"zone:{zone}"] + zone_tags + tags)), "priceRef": aid,
            "provenance": {"origin": f"{klass} (nominal {wi} x {di} x {hi} in, {w:.2f} x {d:.2f} x {h:.2f} m); not read from a spec sheet",
                           "retrievedAt": None,
                           "notes": f"{desc[0].upper()}{desc[1:]}. Dimensions are a class estimate, not a measurement; replace with a spec sheet or tape measure before purchase.",
                           "confidence": None, "box_2d": None},
            "style": None, "status": "draft",
        }
        assets.append(a)
        new_rows.append({
            "id": aid, "label": name, "manufacturer": "Generic (class reference)", "model": desc, "listPrice": float(price), "priceStatus": "estimated",
            "vendorUrl": vendor(aid), "asOf": AS_OF,
            "priceNote": f"DEMO ESTIMATE, not a quote and no product page fetched. Anchored to a stated analyst reference point of ${price:,} for a {desc}; band neutral-band-v1 x0.4/x1/x2.5 applied like every estimated item.",
            "method": "neutral-band-v1", "anchor": "analyst-reference"})
    text = CATALOG.read_text(encoding="utf-8")
    end = text.rindex("\n  ]\n}")
    CATALOG.write_text(text[:end] + ",\n" + ",\n".join("    " + json.dumps(r, ensure_ascii=False) for r in new_rows) + text[end:], encoding="utf-8")
    json.loads(CATALOG.read_text(encoding="utf-8"))
    for a in assets:  # validated against the price rows just written
        Asset.model_validate(a)
        (LIB / f"{a['assetId']}.json").write_text(json.dumps(a, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(ROWS)} assets, GLBs and price rows")


if __name__ == "__main__":
    build()
