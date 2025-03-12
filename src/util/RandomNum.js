
export function generateUniqueRandomNumbers(min, max, count) {
    if (count > (max - min + 1)) {
        throw new Error("Count is greater than the range of numbers available.");
    }

    const numbers = new Set();

    while (numbers.size < count) {
        const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
        numbers.add(randomNum);
    }

    return Array.from(numbers);
}
export function generateOneUniqueRandomNumber(min, max) {
    return  Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateOneUniqueRandomNumber2(mins, maxs) {
    // Box-Muller transform to generate normal distribution
    let u1 = Math.random();
    let u2 = Math.random();

    // Generate standard normal random variable (mean=0, sd=1)
    let z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    // Scale z to have mins at -1 sigma and maxs at +1 sigma
    // mean = (maxs + mins) / 2
    // sd = (maxs - mins) / 2
    let mean = (maxs + mins) / 2;
    let sd = (maxs - mins) / 2;
    let result = mean + z * sd;

    // Ensure result doesn't exceed 10
    result = Math.min(result, 10000);
    result = Math.max(result, 2000);

    return Math.floor(result);
}
