const assert = require('assert');

// Mock score staves removal function mimicking create.tsx
function mockRemoveStaff(staves, selectedStaffIndex) {
  const newStaves = [...staves];
  const indexToRemove = selectedStaffIndex !== null ? selectedStaffIndex : newStaves.length - 1;
  if (indexToRemove < 0 || indexToRemove >= newStaves.length) return newStaves;

  let isPart1 = false;
  let isPart2 = false;

  if (
    indexToRemove < newStaves.length - 1 &&
    newStaves[indexToRemove].clef === 'treble' &&
    newStaves[indexToRemove + 1].clef === 'bass'
  ) {
    isPart1 = true;
  }

  if (
    indexToRemove > 0 &&
    newStaves[indexToRemove].clef === 'bass' &&
    newStaves[indexToRemove - 1].clef === 'treble'
  ) {
    isPart2 = true;
  }

  let countToRemove = 1;
  let startIndexToRemove = indexToRemove;

  if (isPart1) {
    countToRemove = 2;
    startIndexToRemove = indexToRemove;
  } else if (isPart2) {
    countToRemove = 2;
    startIndexToRemove = indexToRemove - 1;
  }

  if (newStaves.length - countToRemove < 1) {
    // Mimic alert block by returning the original array
    return newStaves;
  }

  newStaves.splice(startIndexToRemove, countToRemove);
  return newStaves;
}

// Case 1: Grand Staff deletion (selected treble of Pair 1)
const staves1 = [{ clef: 'treble', id: 't1' }, { clef: 'bass', id: 'b1' }, { clef: 'treble', id: 't2' }, { clef: 'bass', id: 'b2' }];
const res1 = mockRemoveStaff(staves1, 0);
assert.deepStrictEqual(res1, [{ clef: 'treble', id: 't2' }, { clef: 'bass', id: 'b2' }]);
console.log('Case 1 Passed: Deleting Treble of Pair 1 deletes entire Pair 1.');

// Case 2: Grand Staff deletion (selected bass of Pair 1)
const res2 = mockRemoveStaff(staves1, 1);
assert.deepStrictEqual(res2, [{ clef: 'treble', id: 't2' }, { clef: 'bass', id: 'b2' }]);
console.log('Case 2 Passed: Deleting Bass of Pair 1 deletes entire Pair 1.');

// Case 3: Grand Staff deletion (selected treble of Pair 2)
const res3 = mockRemoveStaff(staves1, 2);
assert.deepStrictEqual(res3, [{ clef: 'treble', id: 't1' }, { clef: 'bass', id: 'b1' }]);
console.log('Case 3 Passed: Deleting Treble of Pair 2 deletes entire Pair 2.');

// Case 4: Single Staff deletion (selected middle treble)
const staves2 = [{ clef: 'treble', id: 't1' }, { clef: 'treble', id: 't2' }, { clef: 'treble', id: 't3' }];
const res4 = mockRemoveStaff(staves2, 1);
assert.deepStrictEqual(res4, [{ clef: 'treble', id: 't1' }, { clef: 'treble', id: 't3' }]);
console.log('Case 4 Passed: Deleting a single staff in Single Staff mode only removes that staff.');

// Case 5: Single Staff deletion (selected first treble)
const res5 = mockRemoveStaff(staves2, 0);
assert.deepStrictEqual(res5, [{ clef: 'treble', id: 't2' }, { clef: 'treble', id: 't3' }]);
console.log('Case 5 Passed: Deleting the first staff in Single Staff mode only removes the first staff.');

// Case 6: Cannot remove sole remaining pair
const staves3 = [{ clef: 'treble', id: 't1' }, { clef: 'bass', id: 'b1' }];
const res6 = mockRemoveStaff(staves3, 0);
assert.deepStrictEqual(res6, staves3); // Should be unchanged because length would drop to 0
console.log('Case 6 Passed: Cannot delete the sole remaining grand staff pair.');

console.log('\nAll staff deletion unit tests passed!');
