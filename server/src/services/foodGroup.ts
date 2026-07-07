// Simple keyword-matching classifier that assigns each cached food a coarse
// `FoodGroup` bucket, used by the health score's variety factor. This is a
// write-time enrichment heuristic, not a precision classifier — "roughly
// right" is the bar for a single-user app, not exhaustive food-science
// coverage. See `shared/src/food.ts` for the `FoodGroup` enum this maps into.
import type { FoodGroup } from "shared";

type MatchableFoodGroup = Exclude<FoodGroup, "other">;

// Checked in this order — first matching group wins. Ordered so more
// specific/less ambiguous categories (protein, produce, grains, dairy) are
// checked before "fat", since e.g. "peanut butter" or "almond milk" should
// probably read as fat/protein rather than dairy, and nothing else in the
// earlier lists collides with the fat keywords below.
const KEYWORDS: Record<MatchableFoodGroup, string[]> = {
  protein: [
    "chicken",
    "beef",
    "pork",
    "turkey",
    "egg",
    "tofu",
    "fish",
    "salmon",
    "tuna",
    "shrimp",
    "bacon",
    "sausage",
    "lamb",
    "steak",
    "ham",
    "lentil",
    "beans",
    "chickpea",
    "tempeh",
    "seitan",
  ],
  vegetable: [
    "broccoli",
    "spinach",
    "carrot",
    "lettuce",
    // Deliberately not the bare substring "pepper" — it false-positives on
    // "pepperoni", "peppered", "pepper jack", etc.
    "bell pepper",
    "chili pepper",
    "jalapeno",
    "tomato",
    "onion",
    "cucumber",
    "kale",
    "cabbage",
    "zucchini",
    "squash",
    "mushroom",
    "cauliflower",
    "celery",
    "asparagus",
    "corn",
  ],
  fruit: [
    "apple",
    "banana",
    "berry",
    "orange",
    "grape",
    "melon",
    "peach",
    "pear",
    "mango",
    "pineapple",
    "cherry",
    "kiwi",
    "plum",
    "lemon",
    "lime",
    "fig",
  ],
  grain: [
    "bread",
    "rice",
    "pasta",
    "oat",
    "cereal",
    "wheat",
    "tortilla",
    "bagel",
    "noodle",
    "cracker",
    "quinoa",
    "barley",
    "flour",
  ],
  dairy: ["milk", "cheese", "yogurt", "cream", "buttermilk", "custard"],
  fat: [
    "oil",
    "butter",
    "almond",
    "walnut",
    "peanut",
    "cashew",
    "pecan",
    "pistachio",
    "hazelnut",
    "macadamia",
    "avocado",
    "mayonnaise",
    "margarine",
    "seed",
  ],
};

const GROUP_ORDER: MatchableFoodGroup[] = [
  "protein",
  "vegetable",
  "fruit",
  "grain",
  "dairy",
  "fat",
];

// Classifies a food's `name` into a `FoodGroup` bucket by lowercased
// substring match. Falls back to `"other"` when nothing matches.
export function classifyFoodGroup(name: string): FoodGroup {
  const lower = name.toLowerCase();

  for (const group of GROUP_ORDER) {
    if (KEYWORDS[group].some((keyword) => lower.includes(keyword))) {
      return group;
    }
  }

  return "other";
}
