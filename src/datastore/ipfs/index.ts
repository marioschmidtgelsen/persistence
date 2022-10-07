import * as Persistence from "../../persistence/index.js"
import * as IPFSHTTPClient from "ipfs-http-client"

export interface DataStore {
    readonly ipfs: IPFSHTTPClient.IPFSHTTPClient
    readonly manager: Persistence.Entity.Manager
}
export function createDataStore(metamodel: Persistence.Meta.Metamodel, options: IPFSHTTPClient.Options = { url: "http://localhost:5001" }) {
    return new DataStoreImpl(metamodel, options)
}

class DataStoreImpl implements DataStore {
    readonly ipfs: IPFSHTTPClient.IPFSHTTPClient
    readonly manager: Persistence.Entity.Manager
    constructor(readonly metamodel: Persistence.Meta.Metamodel, readonly options: IPFSHTTPClient.Options) {
        this.ipfs = IPFSHTTPClient.create(options)
        this.manager = new Persistence.Entity.Manager(
            metamodel,
            <T extends object>(factory: Persistence.Entity.ConstructorType<T>) => new Query(this, factory, this.createEntity),
            () => new Transaction(this)
        )
    }
    createEntity<T extends object>(value: T) {
        return value
    }
}

class Query<T extends object> extends Persistence.Entity.Query<T> implements Persistence.Entity.Query<T> {
    constructor(readonly datastore: DataStore, factory: Persistence.Entity.ConstructorType<T>, createEntity: Persistence.Entity.EntityFactory<T>) { super(datastore.manager, factory, createEntity) }
    protected async select(key: any): Promise<T> {
        const cid = typeof key == "string" ? IPFSHTTPClient.CID.parse(key) : key
        const node = await this.datastore.ipfs.dag.get(cid!)
        const entity = new this.type.factory()
        for (const attribute of this.type.attributes) {
            if (attribute.association) {
                const key = Reflect.get(node.value, attribute.name)
                const value = await this.manager.find(attribute.type.factory, key)
                const result = Reflect.set(entity, attribute.name, value)
                if (!result) throw new Error("IllegalAccessException")
            } else {
                const value = Reflect.get(node.value, attribute.name)
                const result = Reflect.set(entity, attribute.name, value)
                if (!result) throw new Error("IllegalAccessException")
            }
        }
        return entity
    }
}

class Transaction extends Persistence.Entity.Transaction implements Persistence.Entity.Transaction {
    constructor(readonly datastore: DataStore) { super(datastore.manager) }
    protected createPersister<T extends object>(type: Persistence.Meta.EntityType<T>) { return new Persister(this, type) }
}

class Persister<T extends object> extends Persistence.Entity.EntityPersister<T> implements Persistence.Entity.EntityPersister<T> {
    constructor(readonly transaction: Transaction, readonly type: Persistence.Meta.EntityType<T>) { super(transaction, type) }
    protected async delete(entity: T, key: any) { throw new Error("Method not implemented.") }
    protected async insert(entity: T) {
        let node = this.createDAGNode(entity)
        let cid = await this.transaction.datastore.ipfs.dag.put(node)
        // TODO: Publish a named record to make the DAG node mutable
        return cid.toString()
    }
    protected async update(entity: T, key: any) { 
        let node = this.createDAGNode(entity)
        let cid = await this.transaction.datastore.ipfs.dag.put(node)
        // TODO: Publish this new immutable DAG node under an existing published name
        return cid.toString()
    }
    private createDAGNode(entity: T) {
        let entries = new Map<string, any>()
        for (const attribute of this.type.attributes) {
            if (attribute.association) {
                let value = Reflect.get(entity, attribute.name) as object
                let key = this.transaction.cache.key(attribute.type as Persistence.Meta.EntityType, value)
                let cid = IPFSHTTPClient.CID.parse(key)
                entries.set(attribute.name, cid)
            }
            else {
                let value = Reflect.get(entity, attribute.name)
                entries.set(attribute.name, value)
            }
        }
        return Object.fromEntries(entries)
    }
}