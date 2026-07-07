import { describe, expect, it } from "vitest";
import { classifyFoodGroup } from "./foodGroup.js";

describe("classifyFoodGroup", () => {
  it("classifies protein foods", () => {
    expect(classifyFoodGroup("Chicken breast, grilled")).toBe("protein");
    expect(classifyFoodGroup("Ground beef, 90% lean")).toBe("protein");
    expect(classifyFoodGroup("Large egg, boiled")).toBe("protein");
    expect(classifyFoodGroup("Firm tofu")).toBe("protein");
  });

  it("classifies vegetables", () => {
    expect(classifyFoodGroup("Broccoli, steamed")).toBe("vegetable");
    expect(classifyFoodGroup("Baby spinach")).toBe("vegetable");
    expect(classifyFoodGroup("Carrot sticks")).toBe("vegetable");
    expect(classifyFoodGroup("Romaine lettuce")).toBe("vegetable");
    expect(classifyFoodGroup("Red bell pepper, raw")).toBe("vegetable");
  });

  it("does not misclassify 'pepperoni' as a vegetable via a bare 'pepper' substring match", () => {
    expect(classifyFoodGroup("Thin Crust Pepperoni Pizza")).toBe("other");
  });

  it("classifies fruits", () => {
    expect(classifyFoodGroup("Apple, raw, with skin")).toBe("fruit");
    expect(classifyFoodGroup("Banana, ripe")).toBe("fruit");
    expect(classifyFoodGroup("Blueberry, frozen")).toBe("fruit");
    expect(classifyFoodGroup("Orange juice, fresh")).toBe("fruit");
  });

  it("classifies grains", () => {
    expect(classifyFoodGroup("Whole wheat bread")).toBe("grain");
    expect(classifyFoodGroup("White rice, cooked")).toBe("grain");
    expect(classifyFoodGroup("Spaghetti pasta")).toBe("grain");
    expect(classifyFoodGroup("Rolled oats")).toBe("grain");
  });

  it("classifies dairy", () => {
    expect(classifyFoodGroup("2% milk")).toBe("dairy");
    expect(classifyFoodGroup("Cheddar cheese")).toBe("dairy");
    expect(classifyFoodGroup("Plain Greek yogurt")).toBe("dairy");
  });

  it("classifies fats", () => {
    expect(classifyFoodGroup("Olive oil")).toBe("fat");
    expect(classifyFoodGroup("Salted butter")).toBe("fat");
    expect(classifyFoodGroup("Roasted almonds")).toBe("fat");
    expect(classifyFoodGroup("Avocado, raw")).toBe("fat");
  });

  it("falls back to 'other' when nothing matches", () => {
    expect(classifyFoodGroup("Potato chips")).toBe("other");
    expect(classifyFoodGroup("Chocolate chip cookie")).toBe("other");
    expect(classifyFoodGroup("Sparkling water")).toBe("other");
  });

  it("matches case-insensitively", () => {
    expect(classifyFoodGroup("CHICKEN BREAST")).toBe("protein");
  });
});
