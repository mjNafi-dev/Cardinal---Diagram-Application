import { uid, type DEdge, type DNode, type Doc, type Field } from './types';

const f = (name: string, type: string, extra: Partial<Field> = {}): Field => ({ id: uid('f'), name, type, ...extra });

export function sampleCrowsFoot(): Doc {
  const customer: DNode = { id: uid('n'), kind: 'table', x: 60, y: 80, text: 'Customer', fields: [f('customer_id', 'INT', { pk: true }), f('name', 'VARCHAR(100)'), f('email', 'VARCHAR(255)', { unique: true }), f('created_at', 'DATETIME')] };
  const order: DNode = { id: uid('n'), kind: 'table', x: 420, y: 60, text: 'Order', fields: [f('order_id', 'INT', { pk: true }), f('customer_id', 'INT', { fk: true }), f('ordered_at', 'DATETIME'), f('status', 'VARCHAR(20)')] };
  const item: DNode = { id: uid('n'), kind: 'table', x: 420, y: 330, text: 'OrderItem', fields: [f('order_id', 'INT', { pk: true, fk: true }), f('product_id', 'INT', { pk: true, fk: true }), f('quantity', 'INT'), f('unit_price', 'DECIMAL(10,2)')] };
  const product: DNode = { id: uid('n'), kind: 'table', x: 780, y: 300, text: 'Product', fields: [f('product_id', 'INT', { pk: true }), f('name', 'VARCHAR(120)'), f('price', 'DECIMAL(10,2)')] };
  order.fields![1].ref = { node: customer.id, field: customer.fields![0].id };
  item.fields![0].ref = { node: order.id, field: order.fields![0].id };
  item.fields![1].ref = { node: product.id, field: product.fields![0].id };
  const e = (a: DNode, b: DNode, s: DEdge['sourceEnd'], t: DEdge['targetEnd']): DEdge => ({ id: uid('e'), source: { node: a.id }, target: { node: b.id }, sourceEnd: s, targetEnd: t });
  return {
    version: 1,
    notation: 'crowsfoot',
    nodes: [customer, order, item, product],
    edges: [e(customer, order, '11', '0M'), e(order, item, '11', '1M'), e(product, item, '11', '0M')],
  };
}

export function sampleChen(): Doc {
  const N = (kind: DNode['kind'], text: string, x: number, y: number): DNode => ({ id: uid('n'), kind, text, x, y });
  const emp = N('entity', 'EMPLOYEE', 120, 220);
  const dept = N('entity', 'DEPARTMENT', 620, 220);
  const works = N('relationship', 'WORKS_FOR', 370, 208);
  const dep = N('weak-entity', 'DEPENDENT', 120, 460);
  const has = N('identifying-relationship', 'HAS', 115, 340);
  const ssn = N('key-attribute', 'Ssn', 30, 110);
  const name = N('attribute', 'Name', 160, 100);
  const phones = N('multivalued-attribute', 'Phones', 280, 110);
  const age = N('derived-attribute', 'Age', 10, 220);
  const dnum = N('key-attribute', 'Number', 700, 110);
  const dname = N('attribute', 'Name', 560, 110);
  const depName = N('partial-key-attribute', 'Dep_name', 330, 470);
  const E = (a: DNode, b: DNode, extra: Partial<DEdge> = {}): DEdge => ({ id: uid('e'), source: { node: a.id }, target: { node: b.id }, ...extra });
  return {
    version: 1,
    notation: 'chen',
    nodes: [emp, dept, works, dep, has, ssn, name, phones, age, dnum, dname, depName],
    edges: [
      E(emp, works, { chenLabel: 'N', total: true }),
      E(works, dept, { chenLabel: '1' }),
      E(emp, has, { chenLabel: '1' }),
      E(has, dep, { chenLabel: 'N', total: true }),
      E(emp, ssn), E(emp, name), E(emp, phones), E(emp, age),
      E(dept, dnum), E(dept, dname), E(dep, depName),
    ],
  };
}

/** Half adder: Sum = A ⊕ B, Carry = A · B. */
export function sampleCircuit(): Doc {
  const part = (logic: NonNullable<DNode['logic']>, x: number, y: number, text = '', extra: Partial<DNode> = {}): DNode => ({ id: uid('n'), kind: 'logic', logic, x, y, text, ...extra });
  const a = part('switch', 80, 90, 'A', { on: true });
  const b = part('switch', 80, 200, 'B');
  const xor = part('xor', 280, 80, '', { inputs: 2 });
  const and = part('and', 280, 190, '', { inputs: 2 });
  const sum = part('bulb', 480, 80, 'Sum');
  const carry = part('bulb', 480, 190, 'Carry');
  const w = (from: DNode, to: DNode, pin: string): DEdge => ({
    id: uid('e'), source: { node: from.id, field: 'o', side: 'right' }, target: { node: to.id, field: pin, side: 'left' }, sourceEnd: 'none', targetEnd: 'none',
  });
  return {
    version: 1,
    notation: 'crowsfoot',
    mode: 'circuit',
    nodes: [a, b, xor, and, sum, carry],
    edges: [w(a, xor, 'i0'), w(b, xor, 'i1'), w(a, and, 'i0'), w(b, and, 'i1'), w(xor, sum, 'i0'), w(and, carry, 'i0')],
  };
}
