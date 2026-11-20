"""The /equipment endpoints against a real MongoDB.

Each test gets its own throwaway database (see the client fixture), created
with the same validator and indexes as the real one and dropped afterwards,
so nothing here touches the equipment the lab actually has.
"""

import pytest
from bson import ObjectId

from app.mongo import EQUIPMENT
from tests.integration.conftest import AUTH_HEADER

CENTRIFUGE = {
    "name": "pytest centrifuge",
    "type": "centrifuge",
    "specs": {"max_rpm": 15000, "rotor": "fixed-angle", "capacity_ml": 50},
}


@pytest.fixture
def mongo(client):
    # The client fixture already points the app at a throwaway database.
    return client.mongo


def create(client, **overrides) -> dict:
    response = client.post("/equipment/", json={**CENTRIFUGE, **overrides}, headers=AUTH_HEADER)
    assert response.status_code == 201, response.text
    return response.json()["Equipment"]


def test_create_and_read_back(client, mongo):
    item = create(client, serial_number="SN-1")

    assert item["status"] == "available"
    assert item["specs"]["refrigerated"] is False  # default filled in
    assert item["maintenance"] == []
    assert item["created_by"] == str(client.me_id)

    got = client.get(f"/equipment/{item['id']}", headers=AUTH_HEADER)
    assert got.status_code == 200
    assert got.json()["Equipment"]["name"] == "pytest centrifuge"


def test_specs_are_checked_against_the_type(client, mongo):
    typo = client.post(
        "/equipment/",
        json={**CENTRIFUGE, "specs": {**CENTRIFUGE["specs"], "max_rmp": 1}},
        headers=AUTH_HEADER,
    )
    wrong_shape = client.post(
        "/equipment/",
        json={"name": "pytest scope", "type": "microscope", "specs": {"max_rpm": 1}},
        headers=AUTH_HEADER,
    )
    free_form = client.post(
        "/equipment/",
        json={"name": "pytest scale", "type": "other", "specs": {"precision_g": 0.001}},
        headers=AUTH_HEADER,
    )

    assert typo.status_code == 422
    assert ["body", "specs", "max_rmp"] in [e["loc"] for e in typo.json()["detail"]]
    assert wrong_shape.status_code == 422
    assert free_form.status_code == 201, free_form.text


def test_serial_number_is_unique_but_optional(client, mongo):
    create(client, serial_number="SN-dup")
    # Several without one must not collide on null.
    create(client)
    create(client)

    dup = client.post("/equipment/", json={**CENTRIFUGE, "serial_number": "SN-dup"}, headers=AUTH_HEADER)
    assert dup.status_code == 409


def test_filter_and_search(client, mongo):
    create(client, name="pytest Big Centrifuge", location="Room 101")
    create(client, name="pytest Small Centrifuge", status="maintenance")
    create(
        client,
        name="pytest Confocal",
        type="microscope",
        specs={"kind": "optical", "max_magnification": 1000},
    )

    def ids(**params):
        response = client.get("/equipment/", params=params, headers=AUTH_HEADER)
        assert response.status_code == 200, response.text
        return [item["name"] for item in response.json()["Equipment"]]

    assert ids(type="microscope") == ["pytest Confocal"]
    assert ids(status="maintenance") == ["pytest Small Centrifuge"]
    assert ids(search="room") == ["pytest Big Centrifuge"]
    # The list leaves the maintenance log out.
    listed = client.get("/equipment/", headers=AUTH_HEADER).json()
    assert listed["Total"] == 3
    assert all("maintenance" not in item for item in listed["Equipment"])


def test_update_only_writes_what_was_sent(client, mongo):
    item = create(client, location="Room 101")

    response = client.put(
        f"/equipment/{item['id']}",
        json={"status": "in_use", "specs": {**CENTRIFUGE["specs"], "max_rpm": 12000}},
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200, response.text
    updated = response.json()["Equipment"]
    assert (updated["status"], updated["specs"]["max_rpm"], updated["location"]) == ("in_use", 12000, "Room 101")
    assert updated["updated_at"] is not None

    bad_specs = client.put(f"/equipment/{item['id']}", json={"specs": {"kind": "optical"}}, headers=AUTH_HEADER)
    assert bad_specs.status_code == 422


def test_maintenance_log_is_newest_first(client, mongo):
    item = create(client)

    client.post(f"/equipment/{item['id']}/maintenance", json={"note": "first", "date": "2026-01-01"}, headers=AUTH_HEADER)
    response = client.post(f"/equipment/{item['id']}/maintenance", json={"note": "second"}, headers=AUTH_HEADER)

    assert response.status_code == 201, response.text
    notes = [entry["note"] for entry in response.json()["Equipment"]["maintenance"]]
    assert notes == ["second", "first"]


def test_members_can_read_but_not_write(client, mongo, lab_user_id):
    item = create(client)
    client.login(lab_user_id)

    assert client.get("/equipment/", headers=AUTH_HEADER).status_code == 200
    assert client.post("/equipment/", json=CENTRIFUGE, headers=AUTH_HEADER).status_code == 403
    assert client.put(f"/equipment/{item['id']}", json={"status": "retired"}, headers=AUTH_HEADER).status_code == 403
    assert client.delete(f"/equipment/{item['id']}", headers=AUTH_HEADER).status_code == 403


def test_delete_and_unknown_ids(client, mongo):
    item = create(client)

    assert client.delete(f"/equipment/{item['id']}", headers=AUTH_HEADER).status_code == 200
    assert client.get(f"/equipment/{item['id']}", headers=AUTH_HEADER).status_code == 404
    assert client.get(f"/equipment/{ObjectId()}", headers=AUTH_HEADER).status_code == 404
    assert client.get("/equipment/not-an-id", headers=AUTH_HEADER).status_code == 404


def test_validator_rejects_bad_documents_written_directly(client, mongo):
    from pymongo.errors import WriteError

    # Not through the API: the collection's own $jsonSchema still applies.
    with pytest.raises(WriteError):
        client.portal.call(mongo[EQUIPMENT].insert_one, {"name": "pytest raw", "type": "toaster"})
