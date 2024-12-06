
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
