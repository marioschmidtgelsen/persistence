import * as Meta from "./Meta.js"

export type ConstructorType<T extends object = object> = new(...args: any) => T
export interface Manager {
    readonly metamodel: Meta.Metamodel
    find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T>
    flush(): Promise<void>
    persist<T extends object>(entity: T): T
    remove<T extends object>(entity: T): void
    transaction(): Transaction
}
export interface EntityFactory {
    <T extends object>(type: Meta.EntityType<T>, value: T): T
}
export interface TransactionFactory {
    (): Transaction
}
export interface Transaction {
    commit(): Promise<void>
    persist<T extends object>(entity: T): T
    remove<T extends object>(entity: T): void
    rollback(): Promise<void>
}
export interface QueryFactory {
    (): Query
}
export interface Query {
    find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T>
}
export enum State {
    LOADED,
    CREATED,
    CHANGED,
    REMOVED
}
export class Manager implements Manager {
    #transaction?: Transaction
    constructor(
        readonly metamodel: Meta.Metamodel,
        readonly createQuery: QueryFactory,
        readonly createTransaction: TransactionFactory,
        readonly createEntity = EntityFactory.createEntity,
        readonly cache = new Cache()) {
    }
    async find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T> { return this.createQuery().find(factory, key) }
    async flush() { if (this.#transaction) await this.#transaction!.commit() }
    persist<T extends object>(entity: T): T { return this.transaction().persist(entity) }
    remove<T extends object>(entity: T) { this.transaction().remove(entity) }
    transaction() { return this.#transaction || (this.#transaction = this.createTransaction()) }
}
export class EntityFactory implements EntityFactory {
    static createEntity<T extends object>(type: Meta.EntityType<T>, value: T): T { return value }
}
export abstract class Query implements Query {
    constructor(readonly manager: Manager) { }
    async find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T> {
        let type = this.manager.metamodel.getEntityType(factory)
        let entity = this.manager.cache.entity(type, key)
        if (entity) return entity
        let value = await this.select(type, key)
        entity = this.manager.createEntity(type, value)
        this.manager.cache.set(type, entity, key)
        return entity
    }
    protected abstract select<T extends object>(type: Meta.EntityType<T>, key: any): Promise<T>
}
export abstract class Transaction implements Transaction {
    #persisters = new Map<Meta.EntityType<any>, Persister<any>>()
    constructor(readonly manager: Manager, readonly cache = new Cache(manager.cache)) { }
    async commit() {
        for (const [type, persister] of this.#persisters) await persister.flush()
        this.manager.cache.merge(this.cache)
    }
    persist<T extends object>(entity: T): T { return this.getPersister(entity).persist(entity) }
    remove<T extends object>(entity: T) { this.getPersister(entity).remove(entity) }
    async rollback() { throw Error("Method not implemented.") }
    protected getPersister<T extends object>(entityOrType: T | ConstructorType<T>): Persister<T> {
        let type = this.manager.metamodel.getEntityType(entityOrType)
        let persister = this.#persisters.get(type)
        if (persister) return persister
        persister = this.createPersister(type)
        this.#persisters.set(type, persister)
        return persister
    }
    protected abstract createPersister<T extends object>(type: Meta.EntityType<T>): Persister<T>
}
export abstract class Persister<T extends object> {
    #states = new Map<T, State>()
    constructor(readonly transaction: Transaction, readonly type: Meta.EntityType<T>) { }
    async flush() {
        for (const [entity, state] of this.#states) {
            switch (state) {
                case (State.LOADED):
                    break
                case (State.CREATED):
                    let key = await this.insert(entity)
                    this.transition(entity, State.LOADED)
                    this.transaction.cache.set(this.type, entity, key)
                    break
            }
        }
    }
    persist(entity: T) { this.transition(entity, State.CREATED); return entity }
    remove(entity: T) { this.transition(entity, State.REMOVED) }
    protected state(entity: T): State { return this.#states.get(entity)! }
    protected transition(entity: T, state: State) {
        let origin = this.#states.get(entity)
        switch (origin) {
            case (undefined):
                switch (state) {
                    case (State.LOADED):
                    case (State.CREATED):
                        this.#states.set(entity, state)
                        break
                    default:
                        throw Error("IllegalStateTransition")
                }
                break
            case (State.CREATED):
                switch (state) {
                    case (State.LOADED):
                        this.#states.set(entity, state)
                        break
                    default:
                        throw Error("IllegalStateTransition")
                }
                break
            default:
                throw Error("IllegalStateTransition")
        }
    }
    protected abstract insert(entity: T): Promise<any>
    protected abstract update(entity: T, key: any): Promise<any>
    protected abstract delete(entity: T, key: any): Promise<void>
}
/**
 * Implementation of a double mapped list
 */
class KeyValueMap<K = any, V = any> implements Iterable<[K, V]> {
    private keymap = new Map<K, V>()
    private valmap = new Map<V, K>()
    key(value: V): K | undefined { return this.valmap.get(value) }
    value(key: any): V | undefined { return this.keymap.get(key) }
    set(key: any, value: V) { this.keymap.set(key, value); this.valmap.set(value, key) }
    [Symbol.iterator]() { return this.keymap.entries() }
}
/**
 * Implementation of a hierarchical entity cache using double mapped lists per entity type
 */
class Cache {
    private entries = new Map<Meta.EntityType<any>, KeyValueMap<any, object>>()
    constructor(readonly parent?: Cache) { }
    entity<T extends object>(type: Meta.EntityType<T>, key: any): T | undefined {
        return this.getEntry(type)?.value(key)
            || this.parent?.entity(type, key)
    }
    key<T extends object>(type: Meta.EntityType<T>, entity: T): any {
        return this.getEntry(type)?.key(entity)
            || this.parent?.key(type, entity)
    }
    merge(source: Cache) {
        for (const [type, entries] of source.entries) {
            let target = this.getEntry(type)
            if (!target) this.entries.set(type, entries)
            else {
                for (const [key, entity] of entries) {
                    target.set(key, entity)
                }
            }
        }
    }
    set<T extends object>(type: Meta.EntityType<T>, entity: T, key: any) {
        this.getOrSetEntry(type).set(key, entity)
    }
    protected getEntry<T extends object>(type: Meta.EntityType<T>): KeyValueMap<any, T> | undefined {
        return this.entries.get(type) as KeyValueMap<any, T>
    }
    protected getOrSetEntry<T extends object>(type: Meta.EntityType<T>): KeyValueMap<any, T> {
        return this.getEntry(type) || this.setEntry(type)
    }
    protected setEntry<T extends object>(type: Meta.EntityType<T>) {
        let entries = new KeyValueMap<any, T>()
        this.entries.set(type, entries)
        return entries
    }
}