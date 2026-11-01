/** Review steps from Google engineering-practices, "code review". */
export const CHECKLIST: {id: string; label: string}[] = [
  {
    id: 'design',
    label: 'Design: is the overall design sound and does it belong here?',
  },
  {
    id: 'functionality',
    label:
      'Functionality: does it do what the author intended, and is that good for users?',
  },
  {
    id: 'complexity',
    label: 'Complexity: could it be simpler? Any over-engineering?',
  },
  {id: 'tests', label: 'Tests: are there correct, useful tests?'},
  {id: 'naming', label: 'Naming: are names clear and the right length?'},
  {
    id: 'comments',
    label: 'Comments: do they explain why, and are they necessary?',
  },
  {id: 'style', label: 'Style: does it follow the style guide?'},
  {id: 'docs', label: 'Documentation: are docs/READMEs updated?'},
  {
    id: 'every-line',
    label: 'Every line: have I looked at every line assigned to me?',
  },
  {
    id: 'context',
    label: 'Context: did I view the change in the context of the whole system?',
  },
  {
    id: 'good-things',
    label: 'Good things: did I note what the author did well?',
  },
];

/**
 * Whether every checklist item is ticked.
 *
 * @param c Checklist item id to ticked.
 * @return True when all items are ticked.
 */
export const checklistDone = (c: Record<string, boolean>): boolean =>
  CHECKLIST.every((i) => c[i.id]);
