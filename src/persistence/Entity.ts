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
export interface TransactionFactory {
    (): Transaction
}
export interface Transaction {
    commit(): Promise<void>
    persist<T extends object>(entity: T): T
    key<T extends object>(entity: T): any
    remove<T extends object>(entity: T): void
    rollback(): Promise<void>
}
export interface QueryFactory {
    (): Query
}
export interface Query {
    find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T>
}
export interface EntityFactory {
    createEntity<T extends object>(type: Meta.EntityType<T>, value: T): T
}
export enum State {
    LOADED,
    CREATED,
    CHANGED,
    REMOVED
}
export interface ManagerOptions {
    readonly metamodel: Meta.Metamodel
}
export class Manager implements Manager {
    #transaction?: Transaction
    constructor(readonly metamodel: Meta.Metamodel, readonly queryFactory: QueryFactory, readonly transactionFactory: TransactionFactory) { }
    async find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T> { return this.queryFactory().find(factory, key) }
    async flush() { if (this.#transaction) await this.#transaction!.commit() }
    persist<T extends object>(entity: T): T { return this.transaction().persist(entity) }
    remove<T extends object>(entity: T) { this.transaction().remove(entity) }
    transaction() { return this.#transaction || (this.#transaction = this.transactionFactory()) }
}
export class EntityFactory implements EntityFactory {
    createEntity<T extends object>(type: Meta.EntityType<T>, value: T): T { return value }
}
export abstract class Query implements Query {
    constructor(readonly metamodel: Meta.Metamodel, readonly entityFactory = new EntityFactory()) { }
    async find<T extends object>(factory: ConstructorType<T>, key: any): Promise<T> {
        let type = this.metamodel.getEntityType(factory)
        let value = await this.select(type, key)
        let entity = this.entityFactory.createEntity(type, value)
        return entity
    }
    protected abstract select<T extends object>(type: Meta.EntityType<T>, key: any): Promise<T>
}
export abstract class Transaction implements Transaction {
    #persisters = new Map<Meta.EntityType<any>, Persister<any>>()
    constructor(readonly metamodel: Meta.Metamodel, readonly entityFactory = new EntityFactory()) { }
    async commit() { for (const [type, persister] of this.#persisters) await persister.flush() }
    key<T extends object>(entity: T): any { return this.getPersister(entity).key(entity) }
    persist<T extends object>(entity: T): T { return this.getPersister(entity).persist(entity) }
    remove<T extends object>(entity: T) { this.getPersister(entity).remove(entity) }
    async rollback() { throw Error("Method not implemented.") }
    protected getPersister<T extends object>(entityOrType: T | ConstructorType<T>): Persister<T> {
        let type = this.metamodel.getEntityType(entityOrType)
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
    #keys = new Map<T, any>()
    constructor(readonly transaction: Transaction, readonly type: Meta.EntityType<T>) { }
    async flush() {
        for (const [entity, state] of this.#states) {
            switch (state) {
                case (State.LOADED):
                    break
                case (State.CREATED):
                    let key = await this.insert(entity)
                    this.setKey(entity, key)
                    this.setState(entity, State.LOADED)
                    break
            }
        }
    }
    key(entity: T): any { return this.getKey(entity) }
    persist(entity: T) { this.addState(entity, State.CREATED); return entity }
    remove(entity: T) { this.setState(entity, State.REMOVED) }
    protected getKey(entity: T): any { return this.#keys.get(entity) }
    protected setKey(entity: T, key: any) { this.#keys.set(entity, key) }
    protected addState(entity: T, state: State) { this.#states.set(entity, state) }
    protected getState(entity: T): State { return this.#states.get(entity)! }
    protected setState(entity: T, state: State) {
        let origin = this.getState(entity)
        switch (origin) {
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