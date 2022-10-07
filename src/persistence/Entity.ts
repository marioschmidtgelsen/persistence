import { Metamodel, EntityType, Attribute } from "./Meta.js"

export type ConstructorType<T extends object = object> = new(...args: any) => T
export interface Manager {
    readonly metamodel: Metamodel
    find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T>
    flush(): Promise<void>
    persist<T extends object>(entity: T): T
    remove<T extends object>(entity: T): void
    transaction(): Transaction
}
export interface EntityFactory<T> {
    (value: T): T
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
    <T extends object>(factory: ConstructorType<T>): Query<T>
}
export interface Query<T extends object> {
    find(key: any): Promise<T>
}
export enum State {
    LOADED,
    CREATED,
    CHANGED,
    REMOVED
}
export interface EntityChange<T extends object, U> {
    readonly entity: T
    readonly attribute: Attribute<T, U>
    readonly newValue: U
}
export interface ChangeLog<T extends object> {
    append(change: EntityChange<T, any>): void
}
export interface EntityPersister<T extends object> {
    flush(): Promise<void>
    persist(value: T): T
    remove(entity: T): void
}

export class Manager implements Manager {
    #transaction?: Transaction
    constructor(
        readonly metamodel: Metamodel,
        readonly createQuery: QueryFactory,
        readonly createTransaction: TransactionFactory,
        readonly cache = new Cache()) {
    }
    async find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T> { return this.createQuery(factory).find(key) }
    async flush() { if (this.#transaction) await this.#transaction!.commit() }
    persist<T extends object>(entity: T): T { return this.transaction().persist(entity) }
    remove<T extends object>(entity: T) { this.transaction().remove(entity) }
    transaction() { return this.#transaction || (this.#transaction = this.createTransaction()) }
}

export abstract class Query<T extends object> implements Query<T> {
    readonly type: EntityType<T>
    constructor(readonly manager: Manager, factory: ConstructorType<T>, readonly createEntity: EntityFactory<T>) {
        this.type = this.manager.metamodel.getEntityType(factory)
    }
    async find(key: any): Promise<T> {
        let entity = this.manager.cache.entity(this.type, key)
        if (entity) return entity
        let value = await this.select(key)
        entity = this.createEntity(value)
        this.manager.cache.set(this.type, entity, key)
        return entity
    }
    protected abstract select(key: any): Promise<T>
}

export abstract class Transaction implements Transaction {
    #persisters = new Map<EntityType<any>, EntityPersister<any>>()
    constructor(readonly manager: Manager, readonly cache = new Cache(manager.cache)) { }
    async commit() {
        for (const [type, persister] of this.#persisters) await persister.flush()
        this.manager.cache.merge(this.cache)
    }
    persist<T extends object>(entity: T): T { return this.getPersister(entity).persist(entity) }
    remove<T extends object>(entity: T) { this.getPersister(entity).remove(entity) }
    async rollback() { throw Error("Method not implemented.") }
    protected getPersister<T extends object>(entityOrType: T | ConstructorType<T>): EntityPersister<T> {
        let type = this.manager.metamodel.getEntityType(entityOrType)
        let persister = this.#persisters.get(type)
        if (persister) return persister
        persister = this.createPersister(type)
        this.#persisters.set(type, persister)
        return persister
    }
    protected abstract createPersister<T extends object>(type: EntityType<T>): EntityPersister<T>
}

export abstract class EntityPersister<T extends object> implements EntityPersister<T>, ChangeLog<T> {
    #states = new Map<T, State>()
    constructor(readonly transaction: Transaction, readonly type: EntityType<T>) { }
    //#region EntityPersister<T>
    async flush() {
        for (const [entity, state] of this.#states) {
            switch (state) {
                case (State.LOADED):
                    break
                case (State.CREATED): {
                    let key = await this.insert(entity)
                    this.transaction.cache.set(this.type, entity, key)
                    this.transition(entity, State.LOADED)
                    break
                }
                case (State.CHANGED): {
                    let oldKey = this.transaction.cache.key(this.type, entity)
                    let newKey = await this.update(entity, oldKey)
                    // TODO: Delete the oldKey/entity mapping from caches
                    this.transaction.cache.set(this.type, entity, newKey)
                    this.transition(entity, State.LOADED)
                    break
                }
            }
        }
    }
    persist(value: T) {
        // TODO: Refactor proxy creation into a pluggable entity factory
        let changeTracker = new ChangeTracker(this.type, this)
        let entity = new Proxy(value, changeTracker)
        this.transition(entity, State.CREATED)
        return entity
    }
    remove(entity: T) { this.transition(entity, State.REMOVED) }
    //#endregion
    //#region ChangeLog<T>
    append(change: EntityChange<T, any>): void {
        let origin = this.#states.get(change.entity)!
        switch (origin) {
            case (State.CREATED):
            case (State.CHANGED):
                break
            case (State.LOADED):
                this.#states.set(change.entity, State.CHANGED)
                break
            default:
                throw Error("IllegalStateTransition")
        }
    }
    //#endregion
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
            case (State.CHANGED):
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

class ChangeTracker<T extends object> implements ProxyHandler<T> {
    constructor(readonly type: EntityType<T>, readonly log: ChangeLog<T>) { }
    set(target: T, p: string | symbol, newValue: any, receiver: any): boolean {
        let attribute = this.type.getAttribute(p)
        this.log.append({ entity: receiver, attribute, newValue })
        return Reflect.set(target, p, newValue, receiver)
    }
}

class KeyValueMap<K = any, V = any> implements Iterable<[K, V]> {
    private keymap = new Map<K, V>()
    private valmap = new Map<V, K>()
    key(value: V): K | undefined { return this.valmap.get(value) }
    value(key: any): V | undefined { return this.keymap.get(key) }
    set(key: any, value: V) { this.keymap.set(key, value); this.valmap.set(value, key) }
    [Symbol.iterator]() { return this.keymap.entries() }
}

class Cache {
    private entries = new Map<EntityType<any>, KeyValueMap<any, object>>()
    constructor(readonly parent?: Cache) { }
    entity<T extends object>(type: EntityType<T>, key: any): T | undefined { return this.getEntry(type)?.value(key) || this.parent?.entity(type, key) }
    key<T extends object>(type: EntityType<T>, entity: T): any { return this.getEntry(type)?.key(entity) || this.parent?.key(type, entity) }
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
    set<T extends object>(type: EntityType<T>, entity: T, key: any) { this.getOrSetEntry(type).set(key, entity) }
    protected getEntry<T extends object>(type: EntityType<T>): KeyValueMap<any, T> | undefined { return this.entries.get(type) as KeyValueMap<any, T> }
    protected getOrSetEntry<T extends object>(type: EntityType<T>): KeyValueMap<any, T> { return this.getEntry(type) || this.setEntry(type) }
    protected setEntry<T extends object>(type: EntityType<T>) {
        let entries = new KeyValueMap<any, T>()
        this.entries.set(type, entries)
        return entries
    }
}