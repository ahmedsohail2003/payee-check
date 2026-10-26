import type { Samples } from '../kernel/types'

// Fictional sample data, read-only. Every domain ends in the reserved .example, every phone is in the
// fictional 519-555-01xx range, and every name is invented. samples.test.ts checks these rules.

export const SAMPLES: Samples = {
  suppliers: [
    {
      id: 'sup-harbourline',
      name: 'Harbourline Lumber Ltd.',
      onFilePhone: '519-555-0142',
      onFile: { payeeName: 'Harbourline Lumber Ltd.', institution: '947', transit: '01234', account: '50318862' },
    },
    {
      id: 'sup-brackenfold',
      name: 'Brackenfold Aggregates Ltd.',
      onFilePhone: '519-555-0118',
      onFile: { payeeName: 'Brackenfold Aggregates Ltd.', institution: '963', transit: '05520', account: '88120734' },
    },
    {
      id: 'sup-cedarline',
      name: 'Cedarline Electrical Supply Inc.',
      onFilePhone: '519-555-0163',
      onFile: { payeeName: 'Cedarline Electrical Supply Inc.', institution: '958', transit: '40217', account: '3305518' },
    },
    {
      id: 'sup-tallpine',
      name: 'Tallpine Plumbing Wholesale',
      onFilePhone: '519-555-0129',
      onFile: { payeeName: 'Tallpine Plumbing Wholesale', institution: '971', transit: '11807', account: '2049931' },
    },
    {
      id: 'sup-keelson',
      name: 'Keelson Fasteners Co.',
      onFilePhone: '519-555-0151',
      onFile: { payeeName: 'Keelson Fasteners Co.', institution: '984', transit: '36042', account: '61177208' },
    },
  ],
  payments: [
    { id: 'pay-1041', ref: 'PR-2026-1041', supplierId: 'sup-harbourline', amountCents: 1248000, dueDate: '2026-10-30', requestId: 'req-mismatch' },
    { id: 'pay-1042', ref: 'PR-2026-1042', supplierId: 'sup-brackenfold', amountCents: 386215, dueDate: '2026-10-29' },
    { id: 'pay-1043', ref: 'PR-2026-1043', supplierId: 'sup-cedarline', amountCents: 527340, dueDate: '2026-10-30', requestId: 'req-legit' },
    { id: 'pay-1044', ref: 'PR-2026-1044', supplierId: 'sup-tallpine', amountCents: 91875, dueDate: '2026-10-28' },
    { id: 'pay-1045', ref: 'PR-2026-1045', supplierId: 'sup-keelson', amountCents: 43260, dueDate: '2026-10-30' },
  ],
  requests: [
    {
      id: 'req-mismatch',
      supplierId: 'sup-harbourline',
      paymentId: 'pay-1041',
      email: {
        from: 'accounts@harbourline-pay.example',
        subject: 'Updated banking details for Harbourline Lumber Ltd.',
        receivedAt: '2026-10-23T09:14:00-04:00',
        body: [
          'Hello,',
          '',
          'Harbourline Lumber Ltd. has moved its banking. Effective immediately, please send all payments, including PR-2026-1041, to our new account:',
          '',
          'Payee: Harbourline Lumber Ltd.',
          'Institution: 952',
          'Transit: 60415',
          'Account: 73419020',
          '',
          'If you have questions, call our accounts office at 519-555-0187 or write to ap@harbourline-pay.example and we will reply the same day.',
          'You can also confirm the change online at https://harbourline-pay.example/confirm',
          '',
          'Thank you,',
          'Dana Whitlow',
          'Accounts Receivable, Harbourline Lumber Ltd.',
        ].join('\n'),
        contacts: [
          { kind: 'email', value: 'accounts@harbourline-pay.example' },
          { kind: 'phone', value: '519-555-0187' },
          { kind: 'email', value: 'ap@harbourline-pay.example' },
          { kind: 'link', value: 'https://harbourline-pay.example/confirm' },
        ],
      },
      requested: { payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73419020' },
    },
    {
      id: 'req-legit',
      supplierId: 'sup-cedarline',
      paymentId: 'pay-1043',
      email: {
        from: 'billing@cedarline.example',
        subject: 'New bank account for Cedarline Electrical Supply Inc.',
        receivedAt: '2026-10-22T14:05:00-04:00',
        body: [
          'Hi,',
          '',
          "We have moved our business account to a new branch. Starting with this week's payment run, please use:",
          '',
          'Payee: Cedarline Electrical Supply Inc.',
          'Institution: 958',
          'Transit: 40388',
          'Account: 3307126',
          '',
          'Please call us on the number you have on file to confirm before you send anything.',
          'Our office line is 519-555-0164 and remittance notes can go to remit@cedarline.example as usual.',
          '',
          'Regards,',
          'Priya Natarajan',
          'Office Manager, Cedarline Electrical Supply Inc.',
        ].join('\n'),
        contacts: [
          { kind: 'email', value: 'billing@cedarline.example' },
          { kind: 'phone', value: '519-555-0164' },
          { kind: 'email', value: 'remit@cedarline.example' },
        ],
      },
      requested: { payeeName: 'Cedarline Electrical Supply Inc.', institution: '958', transit: '40388', account: '3307126' },
    },
  ],
}
