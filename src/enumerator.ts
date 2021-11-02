export class Enumerator<T> {

  private index = 0;

  public constructor(public items: T[]) { }

  public hasNext() { return this.index < this.items.length; }

  public next() {
    const result = this.items[this.index];
    this.index += 1;
    return result;
  }

}
