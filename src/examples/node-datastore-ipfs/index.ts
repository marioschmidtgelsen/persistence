import { Author, Book } from "./BooksModel.js"
import { AuthorType, BookType, Repository } from "./BooksTypes.js"
import { createDataStore } from "../../datastore/ipfs/index.js"
import * as assert from "assert"

async function testPersist() {
    const datastore = createDataStore(Repository)
    const author = datastore.manager.persist(new Author())
    author.firstname = "Douglas"
    author.lastname = "Adams"
    const book = datastore.manager.persist(new Book())
    book.title = "Hitchhiker's Guide to the Universe"
    book.author = author
    await datastore.manager.flush()
    const key = datastore.manager.cache.key(BookType, book)
    assert.strictEqual(key, "bafyreiftf6ezielotf46den32naywudczeemlxqfzyzoplxzzwfsj2hy4y")
}

async function testFind() {
    const datastore = createDataStore(Repository)
    const book = await datastore.manager.find(Book, "bafyreiftf6ezielotf46den32naywudczeemlxqfzyzoplxzzwfsj2hy4y")
    assert.strictEqual(book.title, "Hitchhiker's Guide to the Universe")
    assert.ok(book.author)
    assert.strictEqual(book.author?.fullname, "Adams, Douglas")
}

async function testChange() {
    const datastore = createDataStore(Repository)
    const author = datastore.manager.persist(new Author())
    author.firstname = "Richard"
    author.lastname = "Bachman"
    await datastore.manager.flush()
    const oldKey = datastore.manager.cache.key(AuthorType, author)
    assert.strictEqual(oldKey, "bafyreiflfdot6qksxvsrslk3cpvfowmuyiwm3ckum2djggklaqsoc6xvcu")
    author.firstname = "Stephen"
    author.lastname = "King"
    await datastore.manager.flush()
    const newKey = datastore.manager.cache.key(AuthorType, author)
    assert.strictEqual(newKey, "bafyreid65ob6xnp6sumorvvykvlr2db4enrqmheneaxz2n743j7bpy7sq4")
}

async function testAll() {
    return Promise.all([
        testPersist(),
        testFind(),
        testChange()
    ])
}

await testAll()