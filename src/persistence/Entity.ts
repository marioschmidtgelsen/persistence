import * as Meta from "./Meta.js"

export type ConstructorType<T extends object = object> = new(...args: any) => T
export interface UpdateEventListener { <T extends object>(entity: T): void }
export interface Manager {
    readonly metamodel: Meta.Metamodel
    contains<T extends object>(entity: T): boolean
    detach<T extends object>(entity: T): void
    find<T extends object>(type: ConstructorType<T>, key: any): AsyncGenerator<T>
    persist<T extends object>(entity: T): T
    remove<T extends object>(entity: T): void
    update<T extends object>(entity: T): Promise<void>
    onupdate(listener: UpdateEventListener): void
}
export class Manager implements Manager {
    #persisters = new Map<Meta.EntityType<any>, EntityPersister<any>>()
    #updateEventListeners = new Set<UpdateEventListener>()
    constructor(readonly metamodel: Meta.Metamodel) { }
    contains<T extends object>(entity: T): boolean { return this.getEntityPersister(entity).contains(entity) }
    detach<T extends object>(entity: T): void { return this.getEntityPersister(entity).detach(entity) }
    async *find<T extends object>(type: ConstructorType<T>, key: any) { yield *this.getEntityPersister(type).find(key) }
    persist<T extends object>(entity: T): T { return this.getEntityPersister(entity).persist(entity) }
    remove<T extends object>(entity: T): void { this.getEntityPersister(entity).remove(entity) }
    async update<T extends object>(entity: T) { return this.getEntityPersister(entity).update(entity) }
    onupdate(listener: UpdateEventListener): void { this.#updateEventListeners.add(listener) }
    protected createEntityPersister<T extends object>(type: Meta.EntityType<T>) {
        let persister = new EntityPersister(this, type)
        persister.onupdate(entity => this.emitOnUpdate(entity))
        this.#persisters.set(type, persister)
        return persister
    }
    protected getEntityPersister<T extends object>(entityOrType: T | ConstructorType<T>): EntityPersister<T> {
        let type = this.metamodel.getEntityType(entityOrType)
        return this.#persisters.get(type) || this.createEntityPersister(type)
    }
    protected emitOnUpdate<T extends object>(entity: T): void { this.#updateEventListeners.forEach(listener => listener(entity)) }
}

enum State {
    LOADED,
    CREATED,
    CHANGED,
    REMOVED
}
class EntityPersister<T extends object> {
    #entities = new Map<T, State>()
    #updateEventListeners = new Set<UpdateEventListener>()
    constructor(readonly manager: Manager, readonly type: Meta.EntityType<T>) { }
    contains(entity: T): boolean { return this.#entities.has(entity) }
    detach(entity: T) { this.#entities.delete(entity) }
    async *find(key: any): AsyncGenerator<T> {
        for (const entity of this.#entities.keys()) {
            for (const attribute of this.type.attributes) {
                if (attribute.key) {
                    let value = Reflect.get(entity, attribute.name)
                    if (key == value) yield entity
                }
            }
        }
    }
    persist(entity: T): T { this.#entities.set(entity, State.CREATED); return entity }
    remove(entity: T) { this.#entities.set(entity, State.REMOVED) }
    async update(entity: T) {
        let state = this.#entities.get(entity)!
        switch (state) {
            case (State.LOADED):
                break
            case (State.CREATED):
            case (State.CHANGED):
                await this.updateReferencedEntities(entity)
                this.emitOnUpdate(entity)
                this.#entities.set(entity, State.LOADED)
                break
            case (State.REMOVED):
                this.detach(entity)
                break
        }
    }
    onupdate(listener: UpdateEventListener): void { this.#updateEventListeners.add(listener) }
    protected async *getEntityReferences(entity: T) {
        for (const attribute of this.type.attributes) {
            if (attribute.association) {
                let reference = Reflect.get(entity, attribute.name) as T
                yield reference
            }
        }
    }
    protected emitOnUpdate<T extends object>(entity: T): void { this.#updateEventListeners.forEach(listener => listener(entity)) }
    protected async updateReferencedEntities(entity: T) {
        for await (const reference of this.getEntityReferences(entity)) {
            await this.manager.update(reference)
        }
    }
}